---
title: Setting up Identity services for my home lab
draft: false
date: 2025-10-01
tags:
  - linux
---

## Background

_What is Man? A miserable little pile of secrets_
    - André Malraux

I'm going to be honest with you, I thought that quote was from Dracula in the
Castlevania video game series. I was pleasantly surprised to learn it is
actually from the French novelist André Malraux, and I feel considerably more
erudite and learned for attributing the quote to him instead. I also considered
a pithy segue into how the attribution of that quote resonates in some
fundamental way with Identity Services, but I'll spare you and get right to it.

For setting up [[open-ondemand|Open OnDemand]], I needed to create some
identity services in my lab. This seemed like a good opportunity to take a
second look at some technologies I've considered but ultimately passed over at
$JOB for various reasons. 

There's a wonderful presentation by William Brown about Kanidm (see below), in which he
covers a bit of the history of identity management systems. One of the things
that I recall from William's talk is that there's a sort of schism between
identity and auth services, with traditional enterprises relying on Active
Directory, LDAP, Kerberos and so on, while small, little-known startups like
Google and Twitter developed web-centric authentication and authorization
systems that would evolve into modern standards like OpenID and OAuth2.

For modern research computing environments, there's a need to support both.
Traditional identity services are essential to shared UNIX environments, while
(arguably) more modern technologies like OAuth2 are a requirement for providing
services like Jupyter, Open OnDemand, etc.

For my home lab, I've decided to check out a simplified LDAP implementation
called [LLDAP](https://github.com/lldap/lldap) (yes, so light they say it
twice). 

Since I've extolled the virtues of Kanidm, you might be wondering why I didn't
pick it for this project. A couple of reasons:

    1. I wanted to do this project sans Docker, and Kani seems to only have
       Docker as a deployment option. Understandable, but I'm a little burnt
       out on the Cloud Native world to be honest.
    2. Kani's security focus is laudable, but I'm taking some shortcuts for a
       lab environment that is never exposed to the WAN. Yes.. I know, defense
       in depth, etc.
    3. While Kani's Oauth2 implementation would probably work with my Open
       OnDemand environment, but I don't want to go too far off of the beaten
       path.

## LLDAP setup on Debian 12
LLDAP is incredibly straight-forward to setup. Since I'm using Debian, I will use the packages from the OpenSUSE build service as such:
```bash
apt install curl gpg
echo 'deb http://download.opensuse.org/repositories/home:/Masgalor:/LLDAP/Debian_12/ /' | tee /etc/apt/sources.list.d/home:Masgalor:LLDAP.list
curl -fsSL https://download.opensuse.org/repositories/home:Masgalor:LLDAP/Debian_12/Release.key | gpg --dearmor | tee /etc/apt/trusted.gpg.d/home_Masgalor_LLDAP.gpg > /dev/null
apt update
apt install lldap
```

Once it's installed, fire it up:
```bash
systemctl enable lldap --now
```

## Ansible configuration

Similar to my other notes, here's an ansible version of the same thing:

```yaml
- name: idm
  hosts: idm
  handlers:
    - name: restart lldap
      ansible.builtin.service:
        name: lldap
        state: restarted
  tasks:
    - name: insert lldap apt source
      ansible.builtin.copy:
        src: files/repos/home:Masgalor:LLDAP.list
        dest: /etc/apt/sources.list.d/home:Masgalor:LLDAP.list
    - name: insert lldap repo gpg key
      ansible.builtin.copy:
        src: files/repos/home_Masgalor_LLDAP.gpg
        dest: /etc/apt/trusted.gpg.d/home_Masgalor_LLDAP.gpg
    - name: configure lldap
      ansible.builtin.copy:
        src: files/lldap/lldap_config.toml
        dest: /etc/lldap/lldap_config.toml
      notify:
        - restart lldap
    - name: install lldap
      apt:
        name:
        - lldap
```

## Creating users

Once LLDAP was up and running, I visited the web portal at `lldap:17170` and
changed the default credentials for the admin user, logged in, and created
myself a user.

![[images/lldap-config.png]]

## Testing LLDAP with SSSD 

## Dex
Most of my experience is with [Keycloak](https://www.keycloak.org/), the open
source upstream of [Red Hat Single
Sign-On](https://access.redhat.com/products/red-hat-single-sign-on/). While I
think Keycloak is an excellent technology at scale, I wanted to roll with
something a bit more simple this time around.

## Kanidm Presentation
![](https://www.youtube.com/watch?v=8IaxnSAggkI)
