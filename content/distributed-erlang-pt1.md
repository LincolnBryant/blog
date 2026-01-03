---
title: Distributed Erlang Notes, Part 1
draft: false
date: 2026-01-02
tags:
  - erlang
---

I've been having fun with distributed Erlang over the holiday break, and I
wanted to post some collected notes about my misadventures.

## We hate epmd, sorta
The Erlang Port Mapper Daemon (epmd) provides connection information (ip, port)
to nodes in an Erlang cluster. It is a lookup service that allows
multiple Erlang Run Time System (erts) instances to find other nodes in an
automagical way. It works like this:
   * When the first Erlang instance fires up on the node, it also
     launches the epmd as a separate daemon.
   * The epmd listens on a well-known port (4369), and Erlang knows to check
     this port by default for port mapping information.
   * When additional Erlang instances start up they also try to start an epmd,
     which will exit silently after failing to bind to 4369.
   * When an Erlang instance exits, the epmd sticks around indefinitely,
     waiting forlornly for another Erlang node to start.

I don't understand why Erlang defaults to automagic in this instance.
Why is there not just a `net_kernel:connect_node(Name, Port)` function? The
portmapper daemon smacks a bit of 1990s-style systems design. Perhaps
Programmers on a Parallel Earth embraced DNS SRV records for this purpose, and
funnily enough that idea seems to be getting some traction in today's container
heavy world. Maybe portmappers, both epmbd and nfs (notorious for enabling UDP
amplification attacks, BTW) are best relegated to the dustbin of history along
with stuff like the internet super-server, _inetd_.

Another thing that I dislike about epmd is that it binds to all interfaces and
leaks port mapping information to the world. Easily fixed, but not a sensible
default in my opinion. The Erlang Security WG agrees, and posted about it
[here](https://erlef.org/blog/eef/epmd-public-exposure). On the other hand, a
patient attacker could determine this information themselves with judicious use
of `nmap`, so the actual vulnerability here is debatable.

## epmd is good, actually

One of the cool patterns you see pop up all of the time in the Erlang world is
allowing developers to build their own blackjack-and-hookers implementation of
whatever by heavy use of behaviors and callbacks. epmd is no exception here,
and the [Erlang
documentation](https://www.erlang.org/doc/apps/erts/alt_disco.html) lays out
how you can build your own epmd alternative by writing an Erlang program that
implements the epmd API.


## Ok, so let's turn off epmd then

While I plan to keep the idea of implementing my own epmd in my back pocket,
for now I'd like to get some work done without unnecessary daemons floating
around.

First, create a `sys.config` that modifies the kernel application to use a
non-standard port for distribution:
```
[
    {kernel, [
        {erl_epmd_node_listen_port, 4370}
    ]}
].
```

Then fire up Erlang, disabling epmd and setting a node name:

```
erl -start_epmd false -sname node -config sys.config
```

At this point, since there's no epmd involved, and thus no automagic
ip/port resolution, connection attempts will always assume the
`erl_epmd_node_listen_port`.

Starting another node on a second host (or container/jail/vm) with the same
parameters, you should be able to connect. Remember, since we don't have an
epmd, we can't have multiple Erlang instances talk to each other on the same
box!

```
(node@erl01)1> net_kernel:connect_node(node@erl02).
true
(node@erl01)2> net_adm:ping(node@erl02).
pong
```

## Rebar-flavored Configuration

I had a lot of trouble getting this working correctly under rebar. For reasons
unclear to me, `rebar3 shell` ignores my directions to skip an epmd and
launches it anyhow. I haven't dug into this any more, but the mitigation was to
use releases with the `console` command instead. In any case, it was a good
opportunity to learn `relx` and I set up some profiles for my application. For
my app, I put together something like this in my `rebar.config`:

```
{relx, [
        {release, {eb, "1.0.0"},[eb]},
        {sys_config_src, "config/sys.config.src"},
        {vm_args_src, "config/vm.args.src"},
        {dev_mode, true},
        {include_erts, true},
        {extended_start_script, true}
]}.
```

The sys.config and vm.args are templatized, such that I have sensible defaults
with the ability to override them.

`vm.args.src`:
```
-start_epmd false
-sname ${NODE_NAME:-node}
```

`sys.config.src`:
```
[
    {kernel, [
        {erl_epmd_node_listen_port, ${NODE_PORT:-4370}}
    ]}
].
```

Then, instead of my usual `rebar3 shell`, I run something like this:
```
_build/default/rel/myapp/bin/myapp console
```

And I can additionally change the port or default node name like so:
```
NODE_NAME=foo NODE_PORT=12345 _build/default/rel/myapp/bin/myapp console
```
