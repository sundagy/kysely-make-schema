import * as fs from 'fs';

interface column {
    name: string
    type: string
    notNull: boolean
    isPrimary: boolean
    defaultVal?: string
    autoInc: boolean
}

interface table {
    name: string
    cols: column[]
}

interface index {
    name: string
    tableName: string
    cols: string[]
    isUniq: boolean
}

const doSchemas = async (schemasSqlFile: string) => {

    const buf = fs.readFileSync(schemasSqlFile)
    const schemasStr = buf.toString()

    const tables = schemasStr
        .matchAll(/CREATE TABLE (.+?) \(([\w\W]+?)\) ENGINE/g)

    const tablesOut: table[] = []
    const indices: index[] = []

    for (let t of tables) {
        const tab: table = {
            name: t[1],
            cols: [],
        }
        const rows = t[2]
            .split(',\n')
            .map(a => a.replace(/^[\n\s\t]*/, ''));

        for (let r of rows) {

            if (/^UNIQUE KEY|^KEY/.test(r)) {
                const isUniq = /^UNIQUE/.test(r)
                const [, name] = r.match(/KEY (`.+?`)/) ?? []
                const [, colsStr] = r.match(/\((.+)\)/) ?? []
                if (!name || !colsStr) {
                    continue
                }
                indices.push({
                    tableName: tab.name,
                    name,
                    cols: colsStr.split(',').map(a => a.trim()),
                    isUniq,
                })
                continue
            }
            if (/^PRIMARY/.test(r)) {
                const [, name] = r.match(/^PRIMARY KEY \((`.+?`)\)/) ?? []
                if (!name) {
                    continue
                }
                const c = tab.cols.find(a => a.name === name)
                if (c) {
                    c.isPrimary = true
                }
                continue
            }

            r = r.replace(/COMMENT.+/, '').trim()
            const [name] = r.match(/^`.+`/) ?? []
            const [, type] = r.match(/^`.+` (.+?)(NOT|NULL|AUTO|DEFAULT|CHARACTER|COLLATE)/) ?? []
            const notNull = /NOT NULL/.test(r)
            const [, defaultVal] = r.match(/DEFAULT (.+)/) ?? []
            const autoInc = /AUTO_INCREMENT/.test(r)
            if (!name || !type) {
                continue
            }
            tab.cols.push({
                name,
                type: type.trim(),
                notNull: notNull,
                defaultVal: defaultVal === 'NULL' ? undefined : defaultVal,
                isPrimary: false,
                autoInc,
            })
        }
        tablesOut.push(tab)
    }

    await generateKysely(`${schemasSqlFile}.ts`, tablesOut, indices)
}

const defVal = (s: string): string => {
    if (/^CURRENT_TIMESTAMP/.test(s)) {
        return `sql\`${s.toLowerCase()}\``
    }
    return s
}

const typeVal = (s: string): string => {
    if (s === 'int') {
        return `'integer'`
    }
    if (/^tinyint|unsigned|enum\(|smallint|decimal|float|set\(/.test(s)) {
        return `sql\`${s}\``
    }
    return `\`${s}\``
}

const generateKysely = async (outTs: string, tables: table[], indices: index[]) => {

    const buff = `
import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {

${tables.map(t => {
    return `
    await db.schema
        .createTable(${t.name})
        ${t.cols.map(c => {
            const opts: string[] = [
                ...c.autoInc ? ['.autoIncrement()'] : [],
                ...c.isPrimary ? ['.primaryKey()'] : [],
                ...c.notNull ? ['.notNull()'] : [],
                ...!!c.defaultVal ? [`.defaultTo(${defVal(c.defaultVal)})`] : [],
            ]
            return`.addColumn(${c.name}, ${typeVal(c.type)}${opts.length ? `, col => col${opts.join('')}` : ``})`
        }).join('\n        ')}
    .execute();
`
}).join('')}

${indices.map(idx => `

    await db.schema
        .createIndex(${idx.name})${idx.isUniq ? '.unique()' : ''}
        .on(${idx.tableName})
        .columns([${idx.cols.map(a => a.replace(/\(.+?\)/, '')).join(', ')}])
        .execute();
`).join('')}

}`;

    fs.writeFileSync(outTs, Buffer.from(buff))
}


if (process.argv.length > 2) {
    doSchemas(process.argv[2])
        .catch(err => console.error(err))
        .then(() => console.log('ok'))
}
