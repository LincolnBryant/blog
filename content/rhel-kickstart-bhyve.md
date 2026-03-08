---
title: Unattended Enterprise Linux and Fedora VM installs with bhyve
draft: false  
date: 2026-03-08
tags:  
    - bhyve
    - freebsd
    - kickstart
    - automation
    - linux
---

Lately I've been tinkering with
[bootc](https://developers.redhat.com/articles/2024/09/24/bootc-getting-started-bootable-containers)
and found myself in need of having an unattended VM installation
infrastructure. While I am true-blue [[preparing-a-debian-homelab|Debian
convert]] these days, the $JOB's infrastructure generally requires some
variation of Enterprise Linux. The reasons for this generally boil down to:
  * $VENDOR1 can provide OS support as necessary
  * $VENDOR2 will provide GPU and specialized networking drivers 

And, honestly, Enterprise Linux has the best PXE-to-disk automation that I've
tried. For instance, Debian preseeds lack conditional logic -- something I have
direly needed for configuring complex disk setups, matching on labels or
picking the smallest volume for rootfs, etc.

Unhappily, users on the FreeBSD forums seem to have resigned themselves to
believe VM installation must inherently be _clicky clicky_. That is to say, if
you want to create a bhyve VM, you are encouraged to just use the existing
templates and connect over VNC to install your machine. SACRILEGE, I say! My
UNIX world is Old Testament: 80-column, monochromatic terminals and plagues of
locusts.

So, let's figure out how to do it (approximately) right.

# Creating the VM
First thing's first, I download the ISO and create a new VM. I assume bhyve is
already configured and using ZFS etc etc.

```
# Mirror the VM locally
vm iso https://download.rockylinux.org/pub/rocky/10/isos/x86_64/Rocky-10.1-x86_64-boot.iso
# Create the VM with e.g. 100GB root disk, 16GB RAM, 4 CPUs
vm create -t linux-grub-zvol -s 100G -m 16G -c 4 rocky10
```

# Building the Kickstart file

I will put the Kickstart together in pieces here. You can essentially copy this section top-to-bottom into `ks.cfg` and put your own key in there. First some basics - use a text-based install, set localization up, and configure the network for a basic DHCP-style setup:
```
#version=RHEL10
# Installation
text
reboot

# Localization
lang en_US.UTF-8
keyboard us
timezone UTC --utc

# Network
network --bootproto=dhcp --device=link --activate
network --hostname=rocky10
```

I think selinux adds no practical value to most Enterprise Linux or Fedora
installs, sorry. There are much less brain-damaged solutions like
[pledge(2)](https://man.openbsd.org/pledge.2) and
[unveil(2)](https://man.openbsd.org/unveil.2) in the BSD world.

I also turn off the firewall because I'm lazy and it's a home lab. But
honestly, systemd-firewalld is pretty good so feel free to leave it on if you
prefer.

Overall, you should do whatever makes the most sense in your environment -- I
won't judge.

```
# Security
selinux --disabled
firewall --disabled
```

For the root account, I pull a few tricks:
  * I lock the account, such that root has no password
  * I add my SSH public key for the root account, so I can ssh as root when the
    VM comes up
  * Later in the file, you'll see I prohibit password-based login for root in SSH
  * I also set the getty to auto-login as root. If you've
    got root on my FreeBSD hypervisor, you've effectively got root on the VM
    anyhow.

Here's the first bit of that:

```
# Root account
rootpw --lock

# SSH key for root
sshkey --username=root "ecdsa-sha2-nistp256 AAAA..."
```

There's some bhyve-specific stuff I do in the disk configuration, namely I
couldn't get things to work with a GPT formatted disk so I just stick to good
ol' MBR. I want to experiemnt with having /var on a separate partition a well,
so a full log filesystem won't crash the entire machine. N.b., you _must_ use
something other than XFS for these partitions due to some bhyve
incompatibilities. See
[here](https://github.com/grehan-freebsd/grub2-bhyve/issues/8) for the open
issue.

```
# Disk
zerombr
ignoredisk --only-use=vda
clearpart --all --initlabel --disklabel=msdos --drives=vda
#part /     --fstype=ext4  --ondisk=vda --size=1 --grow --asprimary --label=root
part /var --fstype=ext4 --size=65536
part / --fstype=ext4 --size=1 --grow --asprimary --label=root

# Bootloader
bootloader --location=mbr --boot-drive=vda
```

For packages, I keep it tight. I'll add more stuff via Ansible later:
```
# Packages
%packages
@^minimal-environment
openssh-server
vim-enhanced
%end
```

Here's where I follow-up on the root business to configure SSH and the serial console. 

There's also a very important trick to fix up the bootloader! By default, grub
uses BLS (Boot Loader Specification) to dynamically generate the grub entries.
As far as I can tell, that doesn't work with bhyve-grub either. So we just turn
it off and regenerate the config before rebooting into the installed system.

```
# Services
%post
systemctl enable sshd
echo 'PermitRootLogin prohibit-password' >> /etc/ssh/sshd_config

# Auto-login root on console
mkdir -p /etc/systemd/system/serial-getty@ttyS0.service.d/
cat > /etc/systemd/system/serial-getty@ttyS0.service.d/autologin.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM
EOF

# Fix GRUB to use static entries rather than dynamic
# Required by bhyve-grub2 as of FreeBSD 15.0
sed -i 's/GRUB_ENABLE_BLSCFG=true/GRUB_ENABLE_BLSCFG=false/' /etc/default/grub
grub2-mkconfig -o /boot/grub2/grub.cfg
%end

```

# Staging the Kickstart via OEMDRV
There's a few ways to deliver the Kickstart file into Anaconda. Either setup a
webserver and pull it when the machine loads via `inst.ks=http://<your path>`,
_or_ create a small drive with the special disk label `OEMDRV`. If you do the
latter, Anaconda will scan the device for a file named `ks.cfg` and load it for
unattended install. I like this method because I can keep all of the files
needed to configure my VM together after I forget how to do this in a month or
so.

To create and mount the OEMDRV image

```
truncate -s 32m ks.img 
mdconfig -a -t vnode -f ks.img        # -> md0
newfs_msdos -F 16 -L OEMDRV /dev/md0
mkdir /tmp/oemdrv
mount -t msdosfs /dev/md0 /tmp/oemdrv
```

Once it's mounted, copy in the kickstart and umount/detach the image:
```
cp ks.cfg /tmp/oemdrv/
umount /tmp/oemdrv
mdconfig -d -u md0
```

Finally, copy the Kickstart into the VM's configuration directory. For me
that's `/mnt/vm/rocky10`:
```
cp ks.img /mnt/vm/rocky10/ks.img
```

# Updating the VM config

Now that the Kickstart image is staged into the right place, we need to
configure 3 things:
  * Reference the kickstart image as an additional disk
  * Configure the installer to set up a serial console and configure text mode
  * Direct grub to the location of the partition and directory for its
    configuration on disk after installation

In `/mnt/vm/rocky10/rocky.conf`:

```
disk1_type="virtio-blk"
disk1_name="ks.img"
disk1_dev="file"

grub_install0="linux /images/pxeboot/vmlinuz console=ttyS0,115200 inst.text"
grub_install1="initrd /images/pxeboot/initrd.img"
grub_install2="boot"

grub_run_partition="msdos1"
grub_run_dir="/boot/grub2"
```

# Installing

_Finally_, we can install this machine. Run the following, kick back, and relax:

```
vm install -f rocky10 Rocky-10.1-x86_64-boot.iso
```

If all is successful, you should be dropped into a tmux session and the
Anaconda installer should complete installation on its own. Afterwards, you'll
reboot into a root console like this:

```
Rocky Linux 10.1 (Red Quartz)
Kernel 6.12.0-124.40.1.el10_1.x86_64 on x86_64

rocky10 login: root (automatic login)

[root@rocky10 ~]#
```

Chalk one up for the Old Testament.
