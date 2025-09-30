// File: js/procs/help.js

// CORECTURĂ: Am schimbat 'syscall' cu '{ syscall }' pentru a destructura obiectul context.
export default async function help(args, { syscall }) {
    const commandDescriptions = {
        'ls': 'List directory contents.',
        'cat': 'Concatenate and display files.',
        'echo': 'Display a line of text.',
        'mkdir': 'Create a new directory.',
        'touch': 'Create a new empty file.',
        'ps': 'List current processes.',
        'rm': 'Remove files or directories.',
        'cp': 'Copy files or directories.',
        'mv': 'Move or rename files or directories.',
        'pwd': 'Print name of current/working directory.',
        'clear': 'Clear the terminal screen.',
        'help': 'Display information about available commands.'
    };

    try {
        // Obține lista de comenzi de la terminal prin syscall
        const commandPaths = await syscall('terminal.getCommands');
        const commands = Object.keys(commandPaths);

        // Construiește textul de ajutor
        let helpText = 'WebOS Terminal - Available Commands:\n\n';
        
        commands.sort().forEach(cmd => {
            const description = commandDescriptions[cmd] || 'No description available.';
            // Adaugă fiecare comandă și descrierea ei la textul final
            helpText += `${cmd.padEnd(10)} - ${description}\n`;
        });

        // Afișează textul în terminal
        await syscall('stdout', helpText);

    } catch (e) {
        await syscall('stderr', `Error: ${e.message}`);
        return 1; // Returnează un cod de eroare
    }

    return 0; // Returnează succes
}