module example.com/mincode-visual-ts-go-plugin

go 1.24.0

require github.com/mincodeai/plugin-sdk-go v0.0.0-00010101000000-000000000000

// The MinCode Go plugin SDK is vendored in this project (it is not published
// to a module proxy). Update it from the MinCode repository with
// `node tools/plugin-sdk/sync-go-sdk.mjs`, never by editing it here.
replace github.com/mincodeai/plugin-sdk-go => ./third_party/plugin-sdk-go
