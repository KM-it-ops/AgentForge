# Zod v4 breaks Next.js 15 Turbopack build

**Date:** 2026-06-21  
**Area:** studio/

## Problem

`next build` failed collecting `/api/compile` page data:

```
TypeError: Cannot read properties of undefined (reading '_string')
```

## Root cause

`zod@4.x` bundled via Turbopack triggered runtime init errors in Route Handlers at build time.

## Fix

Pin `zod@3.24.2` in `studio/package.json`.

## Proof

```powershell
cd studio
npm run build
npm run test
npm run test:e2e
```

## Files

- `studio/package.json`
