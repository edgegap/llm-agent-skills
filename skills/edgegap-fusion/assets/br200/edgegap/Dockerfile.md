# `assets/br200/edgegap/Dockerfile`

Template file. Write the content of the code block below, without the fences, to `Dockerfile`.

```dockerfile
# BR200 dedicated server image for Edgegap.
#
# Build context: the Unity project root. The Edgegap Unity plugin uses that
# context and passes SERVER_BUILD_PATH when you change the build folder, so
# this file works from the plugin's "Containerize" step and from scripts/package.sh.

FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG SERVER_BUILD_PATH=Builds/EdgegapServer

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 --create-home --home-dir /home/server server \
 && mkdir -p /data && chown server /data

COPY ${SERVER_BUILD_PATH}/ /srv/br200/
COPY edgegap/start-server.sh /usr/local/bin/start-server

# Strip Windows line endings in case the script was checked out with CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/start-server \
 && chmod 0755 /usr/local/bin/start-server /srv/br200/ServerBuild

USER server
WORKDIR /home/server
EXPOSE 7777/udp
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/start-server"]
```
