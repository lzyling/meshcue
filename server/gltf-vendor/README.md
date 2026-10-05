# Offline Draco decoder

`draco_decoder.cjs` is the glTF JavaScript decoder copied from
`three@0.186.1/examples/jsm/libs/draco/gltf/draco_decoder.js` (512,465 bytes).
It is Apache-2.0 licensed; see `LICENSE.draco.txt`. The filename marks the
upstream CommonJS export. The implementation is unchanged; an Apache license comment is prepended so the raw browser asset
also carries the license. Integration packaging copies this decoder to
`vendor/` once; it is loaded as CommonJS outside the ESM host bundles.
The browser receives the same bytes through Vite's local asset URL.

Meshopt is imported from Three's `meshopt_decoder.module.js` by both the server
and viewer. That module includes its WASM and MIT notice; it needs no remote
resource. Its full license is copied into the package as `LICENSE.meshopt.txt`.
No page security policy is changed.
