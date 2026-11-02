// ADAPT: the module path. Versions: nakama-common must be the exact version
// that the Nakama release (and its pluginbuilder image) was built with;
// v1.48.0 matches Nakama 3.41.0. nakama-edgegap is pinned by commit
// pseudo-version because its tags ("0.4.0") have no "v" prefix, so Go can't
// use them: `go get github.com/edgegap/nakama-edgegap@cd9022a`.
module example.com/mygame/nakama

go 1.27.1

require (
	github.com/edgegap/nakama-edgegap v0.0.0-20261030142848-cd9022a091da
	github.com/heroiclabs/nakama-common v1.48.0
)

require google.golang.org/protobuf v1.36.12 // indirect
