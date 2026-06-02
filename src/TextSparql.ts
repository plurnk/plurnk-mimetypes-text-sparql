import { AntlrExtractor, withExtractor } from "@plurnk/plurnk-mimetypes";
import type { ExtractionVisitor } from "@plurnk/plurnk-mimetypes";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { SparqlLexer } from "./generated/SparqlLexer.ts";
import { SparqlParser } from "./generated/SparqlParser.ts";
import { SparqlParserVisitor } from "./generated/SparqlParserVisitor.ts";

// application/sparql-query handler. ANTLR grammar from grammars-v4/sparql.
//
// Parser entry rule: query → prologue (selectQuery | constructQuery |
// describeQuery | askQuery) EOF.
//
// A SPARQL file is typically a SINGLE query. We surface:
//   - BASE IRI                    → module (the resolving root for relative
//                                   IRIs)
//   - each PREFIX binding         → field (prefix-name → IRI mapping)
//   - the query form              → method ("select", "construct",
//                                   "describe", "ask")
//   - SELECT'd variables          → field (each projected variable)
export default class TextSparql extends AntlrExtractor {
    protected parseTree(content: string): unknown {
        const lexer = new SparqlLexer(CharStream.fromString(content));
        const tokens = new CommonTokenStream(lexer);
        const parser = new SparqlParser(tokens);
        parser.removeErrorListeners();
        return parser.query();
    }

    protected createVisitor(): ExtractionVisitor {
        return new TextSparqlVisitor() as unknown as ExtractionVisitor;
    }
}

class TextSparqlVisitor extends withExtractor(SparqlParserVisitor) {
    visitBaseDecl = (ctx: any): null => {
        if (this.inBody) return null;
        const iri = ctx.IRI_REF?.()?.getText?.();
        const name = iri ? stripIriBrackets(iri) : "base";
        this.addSymbol("module", name, ctx);
        return null;
    };

    visitPrefixDecl = (ctx: any): null => {
        if (this.inBody) return null;
        const ns = ctx.PNAME_NS?.()?.getText?.();
        if (!ns) return null;
        // PNAME_NS is like `foaf:`, drop trailing colon for outline.
        const name = ns.endsWith(":") ? ns.slice(0, -1) : ns;
        this.addSymbol("field", name, ctx);
        return null;
    };

    visitSelectQuery = (ctx: any): null => {
        if (this.inBody) return null;
        this.addSymbol("method", "select", ctx);
        const vars = collectChildren(ctx, "var_");
        for (const v of vars) {
            const t = (v as { getText?: () => string }).getText?.();
            if (t) this.addSymbol("field", t, ctx);
        }
        return null;
    };

    visitConstructQuery = (ctx: any): null => {
        if (this.inBody) return null;
        this.addSymbol("method", "construct", ctx);
        return null;
    };

    visitDescribeQuery = (ctx: any): null => {
        if (this.inBody) return null;
        this.addSymbol("method", "describe", ctx);
        return null;
    };

    visitAskQuery = (ctx: any): null => {
        if (this.inBody) return null;
        this.addSymbol("method", "ask", ctx);
        return null;
    };
}

function stripIriBrackets(s: string): string {
    if (s.length >= 2 && s.startsWith("<") && s.endsWith(">")) return s.slice(1, -1);
    return s;
}

function collectChildren(ctx: unknown, methodName: string): unknown[] {
    const node = ctx as Record<string, unknown>;
    const accessor = node[methodName] as ((...args: unknown[]) => unknown) | undefined;
    if (typeof accessor !== "function") return [];
    const raw = accessor.call(node);
    if (Array.isArray(raw)) return raw;
    return raw ? [raw] : [];
}
