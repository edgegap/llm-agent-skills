// ADAPT: the module path. Versions: nakama-common must be the exact version
// that the Nakama release (and its pluginbuilder image) was built with;
// v1.49.0 matches Nakama 3.42.0. nakama-edgegap is pinned by commit
// pseudo-version because its tags ("0.4.0") have no "v" prefix, so Go can't
// use them: `go get github.com/edgegap/nakama-edgegap@902c9aa`.
module example.com/mygame/nakama

go 1.27.3

require (
	github.com/edgegap/nakama-edgegap v0.0.0-20261119204926-902c9aa38db0
	github.com/heroiclabs/nakama-common v1.49.0
)

require google.golang.org/protobuf v1.36.12 // indirect
