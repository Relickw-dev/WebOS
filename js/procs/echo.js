// File: js/procs/echo.js
async function main(args, syscall) {
    // Unește toate argumentele cu un spațiu și adaugă un newline la final.
    const output = args.join(' ') + '\n';
    await syscall('stdout', output);
}

export default main;