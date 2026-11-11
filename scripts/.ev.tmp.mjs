import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite(process.argv[2]);
const r = await pg.query(`select type, payload from event where family_id='fam_riskcheck' and (type like 'ai.%') order by created_at desc limit 8`);
for (const x of r.rows) console.log(x.type, JSON.stringify(x.payload).slice(0, 400));
