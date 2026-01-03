---
title: Distributed Erlang Notes, Part 1
---

I've finally started to dip my toes into distributed Erlang, and I wanted to
post some collected notes about my misadventures.

## We Hate EPMD, sorta
The Erlang Port Mapper Daemon (EPMD) provides connection information (ip, port)
to nodes in an Erlang cluster. It is sort of a lookup service that allows
multiple Erlang Run Time System (ERTS) instances to find other nodes in an
automagical way. As best I can tell, it works something like this:
   * When the first Erlang instance fires up on the node, it also
     launches a separate C program into the background -- the EPMD.
   * The EPMD listens on a well-known port (4369), which other Erlang instances
     on the same machine can check for port mapping information.
   * When additional Erlang instances start up, they also try to start an epmd
     but see that another process is bound to the well-known port, assume it is
     EPMD, and the new EPMD will exit silently.
   * When an Erlang instance exits, the EPMD sticks around indefinitely,
     waiting forlornly for another Erlang node to start.

It's a little unusual to me that Erlang defaults to automagic in this instance.
Why is there not just a `net_kernel:connect_node(Name, Port)` function? The
portmapper daemon smacks a bit of 1990s-style systems design. Perhaps Programmers on a
Parallel Earth embraced DNS SRV records for this purpose, and funnily
enough that idea seems to be getting some traction in today's container heavy
world. Maybe portmappers, both epmbd and nfs (notorious for enabling UDP
amplification attacks, BTW) are best relegated to the dustbin of history along
with stuff like the internet super-server, _inetd_.

One of my problems with the EPMD is that it binds to all interfaces by default.
_To my taste_, it's sort of unpleasant to have a network service exposed on a
machine that could leak information unbeknownst to sysadmins as a default
behavior. On the other hand, I find it a bit hard to believe that leaked EPMD
data would let an attacker do something that couldn't already be accomplished
with `nmap` and patience. Nevertheless, it's significant enough that the Erlang
Security WG posted about it
[here](https://erlef.org/blog/eef/epmd-public-exposure).


## EPMD is good, actually ?

One of the cool patterns you see pop up all of the time in the Erlang world is
allowing developers to build their own blackjack-and-hookers implementation of
whatever by heavy use of behaviors and callbacks. EPMD is no exception here,
and the [Erlang
documentation](https://www.erlang.org/doc/apps/erts/alt_disco.html) lays out
how you can build your own EPMD alternative by writing an Erlang program that
implements the EPMD API.


## Ok, so let's turn off EPMD then

While I plan to keep the idea of implementing my own EPMD in my back pocket,
for now I'd like to get some work done without unnecessary daemons floating
around.

First, create a `sys.config` that modifies the kernel application:
```
[
    {kernel, [
        {erl_epmd_node_listen_port, 4370
    ]}
].
```

This will make Erlang listen on the non-standard port of 4370. At least with
rebar3, Erlang was a bit noisy about some crashy things. I guess having Erlang
listening on 4369 instead of EPMD makes some applications act a bit funny.
Finally you can fire up Erlang:

```
erl -start_epmd false -sname node -config sys.config
```

I think at this point, since there's no EPMD involved, and thus no automagic
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

Now, when doing this with Rebar3, it seems that my usual `rebar3 shell` stopped
working. I don't really understand why, but the mitigation was to use releases
instead. This is OK by me, but perhaps these mysteries are worth looking into
later. In any case, it was a good opportunity to learn `relx` and I set up some profiles for my application. For my app, I put together something like this in my `rebar.config`:

```
{relx, [
        {release, {eb, "1.0.0"},[eb]},
        {sys_config_src, "config/sys.config.src"},
        {vm_args_src, "config/vm.args.src"}
        {dev_mode, true},
        {include_erts, true},
        {extended_start_script, true}
]}.
```

The sys.config and vm.args are templatized, such that I have sensible defaults with the ability to override them as I like.

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

Then, instead of my usual `rebar3 shell`, I run something like this:
```
_build/default/rel/myapp/bin/myapp console
```

And I can additionally change the port or default node name like so:
```
NODE_NAME=foo NODE_PORT=12345 _build/default/rel/myapp/bin/myapp console
```

