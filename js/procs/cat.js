// File: js/procs/cat.js

export default async function main(args, context) {
    const { syscall, stdout, stderr, exit } = context;

    if (args.length === 0) {
        stderr.postMessage("cat: missing operand");
        return exit(1);
    }

    for (const path of args) {
        try {
            const data = await syscall('vfs.read', { path });
            stdout.postMessage(data);
        } catch (e) {
            stderr.postMessage(`cat: ${path}: ${e.message}`);
        }
    }

    exit(0);
}
