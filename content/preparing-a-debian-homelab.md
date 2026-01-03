---
title: Building a Debian-based HPC Home Lab
---

## Setting up the Control plane

### Installing Ansible
On FreeBSD (or whatever you choose to be the control host), you'll need to install a configuration management system. I personally prefer OpenVox (nee Puppet) for large-scale infrastructure, but Ansible is completely adequate for our purposes. Installing on FreeBSD is simple:

```bash
pkg update
pkg install py311-ansible
```

Alternatively, you could install Ansible in a virtual environment or via
Anaconda, whatever your preferred Python package management is. If you don't
have an opinion, then I think that just using the system package manager is
best, even if you might be a bit behind on feature releases.

### Creating some Debian VMs

From [[debian-vm-on-freebsd|Debian VM Installation on FreeBSD]], you should
have a base Debian VM you clone to create the rest of your infrastructure.

I've since upgraded to Debian Sid, but the cloning process is straightforward.
For our tiny cluster, I'll have one slurm control node running slurmctld, and
one worker running slurmd. So let's clone the base Debian Sid VM into two new VMs:

```bash
vm clone deb-sid slurmctl
vm clone deb-sid slurm-c1
```

There's some additonal preparation we need to do before we can kick off the automation.
The cloned VMs will have the same SSH host keys as the original parent VM, so
we should start the VMs and regenerate them. Start and access the VM:

```bash
vm start slurmctl
vm console slurmctl
```

Login as root, or login as your unprivileged user and `su` to root. Then,
remove the SSH keys and regenerate:
```bash
rm -f /etc/ssh/ssh_host_*
dpkg-reconfigure openssh-server
```

It also seems to be a good idea to regenerate the systemd machine id (`/etc/machine-id`):
```bash
rm -f /etc/machine-id
dbus-uuidgen --ensure=/etc/machine-id
```

At this time, I suggest recording the IP address for the VM at this time, via
`ip addr`. You'll need this later.

Repeat the process for any other VMs you've created.

### Preparing the cluster network

You can of course prepare your cluster in arbitrarily complex ways, but for my
purposes I simply insert my VMs' IPs into `/etc/hosts` on the server. For
instance:

```bash
$ tail -n2 /etc/hosts
192.168.68.50 slurmctl slurmctl.heisenburgers.com
192.168.58.53 slurm-c1 slurm-c1.heisenburgers.com
```

## Creating the Ansible playbook
### Inventory
First we'll need to create an inventory of all of our hosts. As I have lazily put the appropriate DNS entries into `/etc/hosts`, the inventory is quite simple:

```yaml
cluster:
  hosts:
    slurmctl:
    slurm-c1:

slurm-mgmt:
  hosts:
    slurmctl:

slurm-worker:
  hosts:
    slurm-c1:
```

I've defined three host groupings here. `cluster` which encompasses all nodes
in the pool. `slurm-mgmt` which is supposed to have the slurm management
software and such, and finally `slurm-worker` which contains all of the worker
nodes.

### The global configuration
My first playbook, which only operated over the `cluster` group looks
essentially like this:

```yaml
- name: base config
  hosts: cluster
  handlers:
  - name: restart munge
    ansible.builtin.service:
      name: munge
      state: restarted
  tasks:
    - name: set hostname
      ansible.builtin.hostname:
        name: "{{ inventory_hostname }}"
    - name: setup /etc/hosts
      ansible.builtin.copy:
        src: files/hosts
        dest: /etc/hosts
    - name: universal packages
      apt:
        name:
          - tmux
          - htop
          - btop
          - neovim
          - sysstat
          - pv
          - munge
          - slurm-client
          - strace
          - nfs-client
    - name: munge setup
      ansible.builtin.copy:
        src: files/munge/munge.key
        dest: /etc/munge/munge.key
      notify:
        - restart munge
```

I am not an Ansible expert, so this organization may be a bit crude or
unidomatic, but bear with me. Reading this from top to bottom, we create a base
config for all hosts in the cluster, set up some handlers (I'll come back to
this momentarily), and then run some tasks. The tasks are as follows:

    * Set up the hostname, using a special built-in variable, such that each node has a name other than `debian` at boot.
    * Copy my static `/etc/hosts` to all machines, so everyone has the same view of DNS
    * Install a number of packages that I find to be useful
    * Setup the `munge` software, slurm's authentication daemon

The munge setup step has something a bit unusual, the `notify` element. This
triggers Ansible to run the *handler* `restart munge`, such that if the munge key
is ever updated on disk, then all nodes will restart their munge daemon to pick
up the new key. In Puppet world, this is a fairly common pattern. I assume the
same is true for Ansible-based environments.

#### Grabbing the Munge key
I store the munge key in `files/munge/munge.key`, which I simply copied off of
the slurmctl VM. It is effectively a binary file, so one way you can copy-paste
this sort of thing is to do something like the following:

```
base64 /etc/munge/munge.key
```

which will produce a safely encoded version of the key that you can copy and paste. Then you can decode it via:

```
echo -n "<paste the key here>" | base64 -d > files/munge/munge.key
```

### Slurm-specific config
For the Slurm-specific configuration, I used the [slurm configuration
tool](https://slurm.schedmd.com/configurator.html). It worked okay, no
complaints. Probably for a more complex, production configuration I'd write it
by hand or otherwise templatize it.

That file was then stored into `files/slurm/slurm.conf`:
```ini
ClusterName=homelab
SlurmctldHost=slurmctl
ProctrackType=proctrack/cgroup
ReturnToService=1
SlurmctldPidFile=/var/run/slurmctld.pid
SlurmctldPort=6817
SlurmdPidFile=/var/run/slurmd.pid
SlurmdPort=6818
SlurmdSpoolDir=/var/spool/slurmd
SlurmUser=slurm
StateSaveLocation=/var/spool/slurmctld
TaskPlugin=task/affinity,task/cgroup
InactiveLimit=0
KillWait=30
MinJobAge=300
SlurmctldTimeout=120
SlurmdTimeout=300
Waittime=0
SchedulerType=sched/backfill
SelectType=select/cons_tres
JobCompType=jobcomp/none
JobAcctGatherFrequency=30
SlurmctldDebug=info
SlurmctldLogFile=/var/log/slurmctld.log
SlurmdDebug=info
SlurmdLogFile=/var/log/slurmd.log
NodeName=slurm-c1 CPUs=4 RealMemory=3072 State=UNKNOWN
PartitionName=debug Nodes=ALL Default=YES MaxTime=INFINITE State=UP
```

#### Adding the slurm-specific parts to the playbook
Here's another dump of YAML representing the slurm configuration:
```yaml
- name: slurm management
  hosts: slurm-mgmt
  handlers:
    - name: restart slurmctld
      ansible.builtin.service:
        name: slurmctld
        state: restarted
  tasks:
    - name: packages
      apt:
        name: 
        - slurmctld
    - name: slurmctld setup
      ansible.builtin.copy:
        src: files/slurm/slurm.conf
        dest: /etc/slurm/slurm.conf
      notify:
        - restart slurmctld
    - name: slurm spool
      ansible.builtin.file:
        path: /var/spool/slurm
        state: directory
        owner: slurm
        group: slurm
        mode: '0755'

- name: slurm worker
  hosts: slurm-worker
  handlers:
    - name: restart slurmd
      ansible.builtin.service:
        name: slurmd
        state: restarted
  tasks:
    - name: packages
      apt: 
        name: 
        - slurmd
    - name: slurmd setup
      ansible.builtin.copy:
        src: files/slurm/slurm.conf
        dest: /etc/slurm/slurm.conf
      notify:
        - restart slurmd
      notify:
        - restart slurmd
```

At this point it may be prudent to start breaking this up into multiple files.
The configuration is getting a bit long although not yet unwieldy. I'll have to
study Ansible a bit more to figure out the best approach to complex
configuration. Nothing particularly special here, basically just using the same
task/handlers approach as I did for the global configuration. 


## Notes, bugs, other annoyances
I'll note here that the initial configuration of my node did not work, with the
node stuck in `inval` state. Apparently I needed to leave my node with a bit of
free memory. Instead of the full 4GB, I've reserved 1GB here for 'system'
things and given the remainign 3GB to slurm.

I found that I needed to create the `/var/spool/slurm` dir on my control node.
Perhaps this is often on a dedicated, high-performance device. The `slurmctld`
wouldn't start without it and couldn't create it on its own. Presumably the
package should do this at install time. TBD.

I also note that running `slurm -C` on the node, which is supposed to print the
node's configuration, hung indefinitely. Inspecting it with `strace` yielded an
ever-increasing number of attempts to open non-existent files:

```
newfstatat(AT_FDCWD, "/sys/class/drm/card6730/device/vendor", 0x7ffc478f02c0, 0) = -1 ENOENT (No such file or directory)
```
Is this a problem with BHyve on FreeBSD, Slurm version, Debian, or some
interplay between all three? In any case, it's not critical.
