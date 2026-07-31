import { build } from "esbuild";
import path from "node:path";

const result = await build({
	entryPoints: ["tests/all.test.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node20",
	write: false,
	logLevel: "silent",
	alias: {
		obsidian: path.resolve("tests/obsidian-stub.ts"),
	},
});

const source = result.outputFiles[0].text;
await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
