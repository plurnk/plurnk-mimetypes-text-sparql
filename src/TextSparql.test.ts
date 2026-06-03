import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextSparql from "./TextSparql.ts";

const metadata = {
    mimetype: "application/sparql-query",
    glyph: "🔍",
    extensions: [".sparql", ".rq"] as const,
};

describe("TextSparql — instantiation", () => {
    it("instantiates with metadata", () => {
        const h = new TextSparql(metadata);
        assert.equal(h.mimetype, "application/sparql-query");
        assert.equal(h.glyph, "🔍");
    });
});

describe("TextSparql — extract", () => {
    it("extracts a SELECT query with projected vars", () => {
        const h = new TextSparql(metadata);
        const src = [
            "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
            "SELECT ?name ?email WHERE {",
            "    ?person foaf:name ?name .",
            "    ?person foaf:mbox ?email .",
            "}",
        ].join("\n");
        const syms = h.extractRaw(src);
        assert.ok(syms.find((s) => s.name === "foaf" && s.kind === "field"));
        assert.ok(syms.find((s) => s.name === "select" && s.kind === "method"));
        assert.ok(syms.find((s) => s.name === "?name" && s.kind === "field"));
        assert.ok(syms.find((s) => s.name === "?email" && s.kind === "field"));
    });

    it("extracts a CONSTRUCT query", () => {
        const h = new TextSparql(metadata);
        const src = [
            "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
            "CONSTRUCT { ?p foaf:knows ?q } WHERE { ?p foaf:knows ?q }",
        ].join("\n");
        const syms = h.extractRaw(src);
        assert.ok(syms.find((s) => s.name === "construct" && s.kind === "method"));
    });

    it("extracts an ASK query", () => {
        const h = new TextSparql(metadata);
        const src = [
            "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
            "ASK { ?p foaf:name \"Alice\" }",
        ].join("\n");
        const syms = h.extractRaw(src);
        assert.ok(syms.find((s) => s.name === "ask" && s.kind === "method"));
    });

    it("extracts a DESCRIBE query", () => {
        const h = new TextSparql(metadata);
        const src = [
            "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
            "DESCRIBE ?p WHERE { ?p foaf:name \"Alice\" }",
        ].join("\n");
        const syms = h.extractRaw(src);
        assert.ok(syms.find((s) => s.name === "describe" && s.kind === "method"));
    });

    it("extracts BASE declaration as module", () => {
        const h = new TextSparql(metadata);
        const src = [
            "BASE <http://example.org/>",
            "SELECT * WHERE { ?s ?p ?o }",
        ].join("\n");
        const syms = h.extractRaw(src);
        const base = syms.find((s) => s.name === "http://example.org/");
        assert.ok(base);
        assert.equal(base.kind, "module");
    });

    it("extracts multiple PREFIX bindings as fields", () => {
        const h = new TextSparql(metadata);
        const src = [
            "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
            "PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
            "SELECT * WHERE { ?s ?p ?o }",
        ].join("\n");
        const syms = h.extractRaw(src);
        const names = syms.map((s) => s.name);
        assert.ok(names.includes("foaf"));
        assert.ok(names.includes("rdf"));
        assert.ok(names.includes("rdfs"));
    });

    it("returns empty array for empty input", () => {
        const h = new TextSparql(metadata);
        assert.deepEqual(h.extractRaw(""), []);
    });

    it("does not throw on malformed source", () => {
        const h = new TextSparql(metadata);
        assert.doesNotThrow(() => h.extractRaw("SELECT broken"));
        assert.doesNotThrow(() => h.extractRaw("@@ bogus"));
    });
});

describe("TextSparql — framework integration", () => {
    it("renders extracted hierarchy via format()", async () => {
        const h = new TextSparql(metadata);
        const out = await h.symbolsRaw("SELECT * WHERE { ?s ?p ?o }");
        assert.ok(out.includes("method select"));
    });

    it("jsonpath dispatches against the deep-json ANTLR parse tree (issue #10)", async () => {
        // Every ANTLR deep tree has a root with a `type` field — verify
        // jsonpath reaches it via the deep-channel dispatch.
        const h = new TextSparql(metadata);
        const roots = await h.query("class Probe {}", "jsonpath", "$.type");
        assert.equal(roots.length, 1);
        assert.equal(typeof roots[0].matched, "string");
    });
});

// Real-world smoke against a DBPedia-style federated SPARQL query.
describe("TextSparql — real-world smoke (DBPedia-shape query)", () => {
    const SRC = [
        "PREFIX dbo:  <http://dbpedia.org/ontology/>",
        "PREFIX dbr:  <http://dbpedia.org/resource/>",
        "PREFIX foaf: <http://xmlns.com/foaf/0.1/>",
        "PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>",
        "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
        "",
        "SELECT ?country ?capital ?population WHERE {",
        "    ?country rdf:type dbo:Country .",
        "    ?country dbo:capital ?capital .",
        "    ?country dbo:populationTotal ?population .",
        "    FILTER (?population > 50000000)",
        "}",
        "ORDER BY DESC(?population)",
        "LIMIT 10",
    ].join("\n");

    it("surfaces all prefixes + query type + projected variables", () => {
        const h = new TextSparql(metadata);
        const syms = h.extractRaw(SRC);
        const names = new Set(syms.map((s) => s.name));

        assert.ok(names.has("dbo"));
        assert.ok(names.has("dbr"));
        assert.ok(names.has("foaf"));
        assert.ok(names.has("rdf"));
        assert.ok(names.has("rdfs"));

        assert.ok(names.has("select"));
        assert.ok(names.has("?country"));
        assert.ok(names.has("?capital"));
        assert.ok(names.has("?population"));
    });
});
