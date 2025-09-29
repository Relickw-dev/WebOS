/*
 * cd - Change Directory (fără funcționalitate 'home')
 *
 * Gestionează strict navigarea către căile specificate.
 * Necesită obligatoriu un argument, altfel returnează o eroare.
 * Caracterul '~' nu este interpretat special.
 *
 * Se bazează pe vfs.resolve() pentru a normaliza calea și pe syz.stat()
 * pentru a valida că este un director valid.
 */
function main(args, stdout, stderr, exit, vfs, cwd) {
  // Pas 1: Validăm că a fost furnizat un argument.
  if (args.length < 2) {
    stderr.write("cd: missing operand\n");
    exit(1); // Ieșim cu un cod de eroare.
    return;
  }

  const targetPath = args[1];

  // Pas 2: Rezolvăm calea folosind VFS.
  // vfs.resolve se va ocupa de '.', '..', căi relative și absolute.
  const resolvedPath = vfs.resolve(targetPath, cwd);

  // Pas 3: Verificăm existența și tipul căii cu un apel de sistem.
  syz.stat(resolvedPath, (err, stats) => {
    if (err) {
      // Eroare: Calea nu există în VFS.
      stderr.write(`cd: no such file or directory: ${targetPath}\n`);
      exit(1);
      return;
    }

    if (stats.type !== 'dir') {
      // Eroare: Calea există, dar nu este un director.
      stderr.write(`cd: not a directory: ${targetPath}\n`);
      exit(1);
      return;
    }

    // Succes: Returnăm noua cale către terminal.
    exit({ new_cwd: resolvedPath });
  });
}