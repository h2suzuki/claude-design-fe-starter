#!/usr/bin/env tsx
import { existsSync } from "node:fs";
import { listSiteScreens } from "../src/mock-screens";
import { EXPORT_DIR, REFERENCE_PAGES_FILE } from "../src/mock-server";

const screens = existsSync(EXPORT_DIR) ? listSiteScreens(EXPORT_DIR, REFERENCE_PAGES_FILE, process.argv.slice(2)) : [];
for (const file of screens) console.log(file);
