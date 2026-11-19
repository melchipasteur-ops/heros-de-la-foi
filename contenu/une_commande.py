"""Transforme un fichier SQL de plusieurs commandes en UNE seule commande (bloc DO),
pour les outils qui refusent plusieurs commandes à la fois
(« cannot insert multiple commands into a prepared statement »).
Usage : python3 contenu/une_commande.py entree.sql sortie.sql
"""
import re, sys

def decouper(sql):
    cmds, cur, i, tag = [], [], 0, None
    while i < len(sql):
        if tag:
            if sql.startswith(tag, i):
                cur.append(tag); i += len(tag); tag = None
            else:
                cur.append(sql[i]); i += 1
            continue
        if sql.startswith('--', i):
            j = sql.find('\n', i); i = len(sql) if j < 0 else j + 1; continue
        if sql[i] == "'":
            j = i + 1
            while True:
                j = sql.index("'", j)
                if sql[j:j+2] == "''": j += 2; continue
                break
            cur.append(sql[i:j+1]); i = j + 1; continue
        m = re.match(r'\$[A-Za-z_]*\$', sql[i:])
        if m:
            tag = m.group(0); cur.append(tag); i += len(tag); continue
        if sql[i] == ';':
            c = ''.join(cur).strip()
            if c: cmds.append(c)
            cur = []; i += 1; continue
        cur.append(sql[i]); i += 1
    c = ''.join(cur).strip()
    if c: cmds.append(c)
    return [c for c in cmds if c.lower() not in ('begin', 'commit')]

entree, sortie = sys.argv[1], sys.argv[2]
cmds = decouper(open(entree, encoding='utf-8').read())
out = ['-- Version « une seule commande » de ' + entree.split('/')[-1] + ' (générée).',
       '-- Copiez TOUT le fichier et exécutez-le en une fois.', 'do $principal$', 'begin']
for n, c in enumerate(cmds):
    t = f'$c{n}$'
    assert t not in c
    out.append(f'  execute {t}{c}{t};')
out += ['end', '$principal$;']
open(sortie, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(sortie, len(cmds), 'commandes')
