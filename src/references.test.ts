import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextSparql from "./TextSparql.ts";

const metadata = {
    mimetype: "application/sparql-query",
    glyph: "🔍",
    extensions: [".sparql", ".rq"] as const,
};
const h = () => new TextSparql(metadata);

// A DBPedia-shape federated query: every PREFIX is declared in-file, every
// prefixed name in the WHERE clause uses one of them. The string literal
// ("frobnicate") and the projected variables (?country ...) must NOT surface
// as refs — they are not prefix uses.
const SRC = [
    "PREFIX dbo:  <http://dbpedia.org/ontology/>",
    "PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
    "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
    "",
    "SELECT ?country ?capital ?label WHERE {",
    "    ?country rdf:type dbo:Country .",
    "    ?country dbo:capital ?capital .",
    "    ?country foaf:name \"frobnicate\" .",
    "    ?capital dbo:label ?label .",
    "}",
].join("\n");

describe("TextSparql — references (prefix-use graph)", () => {
    it("prefixed names are `use` edges to their PREFIX binding, scoped to the query form", () => {
        const refs = h().references(SRC);
        // rdf:type, dbo:Country, dbo:capital, foaf:name, dbo:label → 5 uses.
        assert.equal(refs.filter((r) => r.kind === "use").length, 5);
        assert.ok(refs.some((r) => r.name === "rdf" && r.kind === "use" && r.container === "select"));
        assert.ok(refs.some((r) => r.name === "foaf" && r.kind === "use" && r.container === "select"));
        // dbo is used three times (Country, capital, label).
        assert.equal(refs.filter((r) => r.name === "dbo").length, 3);
    });

    it("variables and string literals are not refs", () => {
        const refs = h().references(SRC);
        assert.ok(!refs.some((r) => r.name === "?country"));
        assert.ok(!refs.some((r) => r.name === "frobnicate"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["frobnicate", "?country", "?capital", "?label", "Country"],
            expectJoins: [
                { refName: "rdf", container: "select" },
                { refName: "dbo", container: "select" },
                { refName: "foaf", container: "select" },
            ],
            expectRefs: [
                { name: "rdf", kind: "use" },
                { name: "dbo", kind: "use" },
                { name: "foaf", kind: "use" },
            ],
        });
    });
});
