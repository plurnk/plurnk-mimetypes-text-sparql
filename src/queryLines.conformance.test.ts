import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextSparql.ts";

// #41: structural matches carry source-line spans (coverage gate).
const h = new Handler({"mimetype":"application/sparql-query","glyph":"🔍","extensions":[".sparql",".rq"]});

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [{ source: "SELECT ?x WHERE { ?x ?y ?z }\n", dialect: "jsonpath", pattern: "$..*" }]);
    });
});
