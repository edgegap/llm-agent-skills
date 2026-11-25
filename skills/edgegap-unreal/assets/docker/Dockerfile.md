# `assets/docker/Dockerfile`

Template file. Write the content of the code block below, without the fences, to `Dockerfile`.

```dockerfile
# Runtime image for a packaged Unreal Engine Linux dedicated server (edgegap-unreal skill).
# Replace <Project> (the .uproject name) and <Module> (the C++ module / server target prefix).
# Package first into Packaged/LinuxServer, then from the repo root:
#   docker build --platform linux/amd64 -t registry.edgegap.com/<registry-project>/<image>:<tag> .
FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
# ca-certificates: HTTPS for the server's self-stop call to Edgegap.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Unreal refuses to start as root.
RUN useradd -m -u 1000 server
WORKDIR /app
COPY --chown=server:server Packaged/LinuxServer /app/
RUN chmod +x /app/<Project>/Binaries/Linux/<Module>Server
USER server

# Documentation only: the port Edgegap exposes is the one on the app version.
EXPOSE 7777/udp

# Run the binary directly, not <Module>Server.sh: that script doesn't exec, so it would
# stay PID 1 and swallow the SIGTERM Edgegap sends when the deployment stops.
# -stdout -FullStdOutLogOutput: without them stdout is buffered and Edgegap logs stay empty.
CMD ["/app/<Project>/Binaries/Linux/<Module>Server", "<Project>", "-log", "-port=7777", "-stdout", "-FullStdOutLogOutput"]
```
