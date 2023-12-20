# Kysely make schema
Little helper to generate Kysely schemas from generic MySQL file

### Example
```shell
yarn start ../schemas.sql
head ../schemas.sql.ts
> import { Kysely, sql } from 'kysely'
> export async function up(db: Kysely<any>): Promise<void> {
>     await db.schema
>         .createTable(`table1`)
```
