# Browser hash adapter

Provide the synchronous SHA-256 surface used by the kernel in a browser bundle.

## Quick start

```ts
import { createHash } from './src/web/shims/node-crypto.js';
console.log(createHash('sha256').update('hello').digest('hex'));
```

## API and usage

`createHash('sha256')` accepts one UTF-8 string through `update` and returns its hex digest through `digest('hex')`. The browser bundler can alias `node:crypto` to this module without changing kernel code.

Use an empty string to hash an empty payload, or pass the serialized state and previous hash to verify a game hash chain. This adapter implements only that small surface; it does not provide Node's general crypto API or streaming updates.

## Verification

Run `npm test -- tests/web/crypto-shim.test.ts`. The tests compare empty, state-shaped, Unicode and multiple-block inputs against Node's SHA-256 implementation. There is no runtime configuration or I/O.
