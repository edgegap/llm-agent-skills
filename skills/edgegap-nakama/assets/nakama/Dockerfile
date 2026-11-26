# Nakama 3.42 with the game's Go module (Edgegap Fleet Manager + matchmaker hook).
# The pluginbuilder tag must match the Nakama tag exactly, or Nakama refuses
# to load the plugin. Change NAKAMA_VERSION, nakama-common in go.mod and the
# nakama-edgegap commit together.
ARG NAKAMA_VERSION=3.42.0

FROM heroiclabs/nakama-pluginbuilder:${NAKAMA_VERSION} AS builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1

WORKDIR /backend
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN go build --trimpath --buildmode=plugin -o ./backend.so .

FROM heroiclabs/nakama:${NAKAMA_VERSION}

COPY --from=builder /backend/backend.so /nakama/data/modules/
# Lua or JavaScript modules can sit next to it, e.g.:
# COPY modules/ /nakama/data/modules/
