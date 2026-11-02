# Nakama 3.41 with the game's Go module (Edgegap Fleet Manager + matchmaker hook).
# The pluginbuilder tag must match the Nakama tag exactly, or Nakama refuses
# to load the plugin.
FROM heroiclabs/nakama-pluginbuilder:3.41.0 AS builder

ENV GO111MODULE=on
ENV CGO_ENABLED=1

WORKDIR /backend
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN go build --trimpath --buildmode=plugin -o ./backend.so .

FROM heroiclabs/nakama:3.41.0

COPY --from=builder /backend/backend.so /nakama/data/modules/
# Lua or JavaScript modules can sit next to it, e.g.:
# COPY modules/ /nakama/data/modules/
