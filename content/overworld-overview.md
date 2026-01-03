---
title: "Overworld - Post Mortem, sorta (pt 1)"
---

Quite some time ago, I wrote a library for building multiplayer games
in Erlang. In this post, I want to talk about what parts of Overworld went
well, what was unexpectedly challenging, and what I'd do differently.

## A match(maker) made in heaven

For as long as I've been in the orbit of the Erlang community,
there's always someone who comes along thinking about building a game server of
some sort in the language. After all, Erlang has a legendary reputation for
reliable distributed computing, and it seems like an awfully good basis for a
Massively Multiplayer game etc. 

There's always a reply guy, especially on Reddit or HN, that will slide in
Cosmo Kramer-style and shout down the poster about how games can _only_ be
written in C or C++ because of PERFORMANCE! But here's the thing:

- Popular, online multiplayer games have been around since the mid 90s
- More performance does not automatically make a better game 
- Computers have gotten 1,000 times faster since then 

At the end of the day, aside from a few whispers here and there of Erlang being
a secret sauce in some popular game backends, I hadn't ever really seen this
idea materialize in an open source way. So... I thought I'd take a
stab at it, too.

## Architecture

The essential architecture of Overworld evolved over many months (years?) to
the following core concepts:
  * OTP behaviours for real time (FPS, RTS, etc) and turn-based (think 4X
    strategies, Blackjack, etc) games.
  * Websocket (TCP) and ENet (UDP) transport protocols
  * Protobuf-based binary serialization

There were a number of other features, like a vector math module, that I ended
up cutting from the library. Doing one thing well is hard enough.

_The_ biggest problem with Overworld was the lack of unified implementation
language for the client and sever. 

While it is pretty easy to get a chat demo up and running, implementing game
logic is unexpectedly hard. I'll write more about that in Pt 2.
