---
title: Who are you? The New Number 2
draft: false
date: 2026-01-04
tags:
    - linux
---

I've been trying to understand how to safely change users when a daemon
executes a task under Linux (and other Unixes, for that matter). I spent quite
some time researching and, in most cases, discarding several ways to do this.

## The traditional way - setuid()

Traditionally, changing users happens via the `setuid()` system call,
sufficiently old that it is part of the lizard brain of UNIX, going all the way
back to version one. For executables that need to run as another user, the
`setuid` bit is traditionally set on the file (`chmod u+s <file>`), such that a
single binary can be elevated to a superuser for some particular task. For
instance, the ping(8) utility has traditionally needed the setuid bit set to
create raw sockets to send ICMP packets. 

### setuid makes admins nervous

The problem with setuid is that programs using it have to be written extremely
carefully, because a single mistake can lead to a malicious user leveraging the
setuid binary to elevate themselves to an all-powerful root user. This isn't
purely academic - this is a real attack vector that gets exploited all the
time, in places you wouldn't think to consider:

  * [screen](https://nvd.nist.gov/vuln/detail/CVE-2025-23395)
  * [ping](https://nvd.nist.gov/vuln/detail/cve-2022-23093)
  * [chsh](https://nvd.nist.gov/vuln/detail/CVE-2018-7169)
  * [cron](https://nvd.nist.gov/vuln/detail/CVE-2006-2607)

## The capability way

One way that Linux maintainers have been starting to clamp down on dangerous
`setuid()` binaries is to instead use the capabilities (caps) subsystem to
grant granular access to privileged operations. For instance, just recursively
looking through my `/usr` directory I find a few items with capabilities
assigned:

```
root@kosh:/usr# getcap -r /usr/*
/usr/bin/kwin_wayland cap_sys_nice=ep
/usr/lib/i386-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-ptp-helper cap_net_bind_service,cap_net_admin,cap_sys_nice=ep
/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-ptp-helper cap_net_bind_service,cap_net_admin,cap_sys_nice=ep
/usr/lib/x86_64-linux-gnu/libexec/ksysguard/ksgrd_network_helper cap_net_raw=ep
/usr/lib/x86_64-linux-gnu/libexec/org_kde_powerdevil cap_wake_alarm=ep
```

Should the KDE power consumption daemon (powerdevil) be able to wake up the
system from sleep? Yes! Should it need to be _fucking root_ to do it? Of course
not! Hence, `CAP_WAKE_ALARM`.

Back to the setuid problem - can I add a cap to my binary to make it possible
to change users, ideally precluding the ability to change to the root user?
Ehh... not really. While I certainly _can_ add `CAP_SETUID` to my binary, it's
effectively exactly the same as giving my binary the `setuid` bit. Back to the
drawing board!

## old school cool - the sudo way

I would be remiss to not write about `sudo` here. However, I really feel that
sudo is more of an administration tool rather than something that should be in
the critical path of a service. While setuid and capabilities are assigned to
binaries, sudo applies to users or groups. Presumably your daemon user would be
using NOPASSWD, and essentially you end up in the same boat as setuid. 

## The polkit way

More granular and application-focused than sudo, Policy Kit (polkit) is an
expressive toolkit used for allowing privileged operations for unprivileged
processes. It's often used for desktop environments to escalate particular
daemons or processes without giving them full root access. 

In my research, it seems that polkit is widely distributed _but_ not widely
used among server installs, as many of these installations lack a desktop
environment where polkit is typically used. polkit has also had its own share
of CVEs, many of which come from the non-memory-safe nature of C, but it's
generally considered robust and reliable today. I'm still trying to put my
finger on the pulse of how administrators feel about polkit, and whether it's
worth pursuing.

Polkit isn't exclusive to Linux, and has been ported to FreeBSD, OpenBSD and
others chiefly for desktop environment integration. That's a plus, but the
specific functionality I'm after is combined with systemd, which can use polkit
as an authorization mechanism for making decisions about privileged operations.
More on that in a later article.
