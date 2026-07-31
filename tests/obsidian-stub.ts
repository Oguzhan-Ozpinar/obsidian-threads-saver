export class TFile {
	path: string;

	constructor(path: string) {
		this.path = path;
	}

	get basename(): string {
		const name = this.path.split("/").pop() ?? "";
		return name.replace(/\.[^.]+$/, "");
	}

	get extension(): string {
		const name = this.path.split("/").pop() ?? "";
		return name.includes(".") ? (name.split(".").pop() ?? "") : "";
	}
}

export class TFolder {
	path: string;
	children: Array<TFile | TFolder> = [];

	constructor(path: string) {
		this.path = path;
	}
}

export function normalizePath(value: string): string {
	const output: string[] = [];
	for (const segment of value.replace(/\\/g, "/").split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") output.pop();
		else output.push(segment);
	}
	return output.join("/");
}

export async function requestUrl(): Promise<never> {
	throw new Error("Unexpected network request in unit test.");
}

export class App {}
