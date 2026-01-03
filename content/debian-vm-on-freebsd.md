---
title: Debian VM Installation on FreeBSD
date: 2025-08-03
draft: false
tags: 
  - freebsd
---

I wanted to create a base Debian VM that I can clone and use for the rest of my
home lab. The following are some technical notes for how to do that.

## Create the VM with BHyve

Add the ISO to BHyve:

```bash
vm iso https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.11.0-amd64-netinst.iso 
```

You will need to create the VM before picking installation media. Here are the
settings I use the following, based on the defaults with some tweaks for CPU/Memory:
```
/mnt/vm/.templates # cat debian.conf 
loader="grub"
cpu=4
memory=4096M
network0_type="virtio-net"
network0_switch="public"
disk0_type="ahci-hd"
disk0_name="disk0.img"
grub_run_partition="1"
grub_run_dir="/boot/grub"
```

The defaults are located at `/usr/local/share/examples/vm-bhyve`, and need to
be copied into your local config area. My configuration has the templates at
`/mnt/vm/.templates`, for instance.

Once you've copied the configuration into place, create the VM. Here I request
100GB of disk when creating this VM:
```bash
vm create -s 100G -t debian deb-base
```

Start the installation, and attach to the console:
```bash
vm install deb-base debian-12.11.0-amd64-netinst.iso
```

At this point, the VM should be running with the installer going.

Attaching to the console:
```bash
vm console deb-base
```

To exit the console, use `~^D` (tilde, plus CTRL-D). 

## Post-install Configuration
I run an update after initial installation, and immediately configure my user
to use sudo. 

```bash
apt update
apt upgrade
apt install sudo
echo "lincoln ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
```

Finally, I copy the key into place from my host machine:
```bash
ssh lincoln@<VM IP> mkdir .ssh
scp ~/.ssh/id_ecdsa.pub lincoln@<VM IP>:~/.ssh/authorized_keys
```

Now all cloned VMs will have my key on them and sudo prepared.

## Cloning a VM

To create a new VM from the base VM, simply use the `clone` subcommand. For
instance, to create a new Debian VM called `deb01`:
```
vm clone deb-base deb01
```

The clone should immediately boot. Once it's running, you will need to complete
a few more preparation steps before it's usable. It's a good practice to
generate the SSH keys and the machine ID, so as not to collide with the
template VM. Run the following as root:

```bash
# Regenerate SSH keys
rm -f /etc/ssh/ssh_host_*
dpkg-reconfigure openssh-server
# Regenerate Machine ID
rm -f /etc/machine-id
dbus-uuidgen --ensure=/etc/machine-id
```

## Next steps

At this point, I configure my network with a DHCP reservation for the VM and
further customize the VM with Ansible.

I also set the VM to autostart on boot, if desired, by editing `/etc/rc.conf`: 
```
vm_list="deb01 deb02 deb03"
```
