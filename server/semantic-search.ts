import OpenAI from "openai";
import { db } from "./db";
import { semanticDocuments, semanticSearchQueries, tseCandidateVotes, tseImportJobs, parties } from "@shared/schema";
import { eq, sql, and, desc, asc, isNotNull, inArray } from "drizzle-orm";
import crypto from "crypto";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CHAT_MODEL = "gpt-4o";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for semantic search");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  
  return response.data[0].embedding;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();
  
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  
  return response.data.map(d => d.embedding);
}

interface SemanticSearchFilters {
  year?: number;
  state?: string;
  party?: string;
  position?: string;
}

interface SemanticSearchResult {
  id: number;
  content: string;
  metadata: any;
  similarity: number;
  year: number | null;
  state: string | null;
  partyAbbreviation: string | null;
  position: string | null;
}

export async function semanticSearch(
  query: string,
  filters: SemanticSearchFilters = {},
  topK: number = 10
): Promise<SemanticSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  
  const conditions: any[] = [isNotNull(semanticDocuments.embedding)];
  
  if (filters.year) {
    conditions.push(eq(semanticDocuments.year, filters.year));
  }
  if (filters.state) {
    conditions.push(eq(semanticDocuments.state, filters.state));
  }
  if (filters.party) {
    conditions.push(eq(semanticDocuments.partyAbbreviation, filters.party));
  }
  if (filters.position) {
    conditions.push(eq(semanticDocuments.position, filters.position));
  }
  
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  
  const results = await db.execute(sql`
    SELECT 
      id,
      content,
      metadata,
      year,
      state,
      party_abbreviation as "partyAbbreviation",
      position,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM semantic_documents
    WHERE embedding IS NOT NULL
      ${filters.year ? sql`AND year = ${filters.year}` : sql``}
      ${filters.state ? sql`AND state = ${filters.state}` : sql``}
      ${filters.party ? sql`AND party_abbreviation = ${filters.party}` : sql``}
      ${filters.position ? sql`AND position = ${filters.position}` : sql``}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);
  
  return results.rows as unknown as SemanticSearchResult[];
}

export async function generateAnswer(
  query: string,
  searchResults: SemanticSearchResult[]
): Promise<{ answer: string; citations: { id: number; snippet: string }[] }> {
  const openai = getOpenAIClient();
  
  const contextSnippets = searchResults.map((r, i) => 
    `[${i + 1}] ${r.content.slice(0, 500)}${r.content.length > 500 ? "..." : ""}`
  ).join("\n\n");
  
  const systemPrompt = `Você é um assistente especializado em dados eleitorais brasileiros. 
Responda perguntas de forma concisa e factual, baseando-se exclusivamente nos dados fornecidos.
Cite as fontes usando o formato [número] quando usar informações específicas.
Se não houver dados suficientes para responder, diga claramente.
Responda em português brasileiro.`;

  const userPrompt = `Pergunta: ${query}

Dados disponíveis:
${contextSnippets}

Forneça uma resposta concisa baseada nos dados acima.`;

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });
  
  const answer = response.choices[0]?.message?.content || "Não foi possível gerar uma resposta.";
  
  const citations = searchResults.slice(0, 5).map(r => ({
    id: r.id,
    snippet: r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
  }));
  
  return { answer, citations };
}

export async function processSemanticSearch(
  query: string,
  filters: SemanticSearchFilters = {},
  userId?: string
): Promise<{
  answer: string;
  citations: { id: number; snippet: string; similarity: number; metadata: any }[];
  totalResults: number;
  responseTime: number;
}> {
  const startTime = Date.now();
  
  const searchResults = await semanticSearch(query, filters, 10);
  
  const { answer, citations } = await generateAnswer(query, searchResults);
  
  const responseTime = Date.now() - startTime;
  
  await db.insert(semanticSearchQueries).values({
    query,
    filters,
    resultCount: searchResults.length,
    responseTime,
    createdBy: userId,
  });
  
  return {
    answer,
    citations: searchResults.slice(0, 5).map(r => ({
      id: r.id,
      snippet: r.content.slice(0, 300) + (r.content.length > 300 ? "..." : ""),
      similarity: r.similarity,
      metadata: r.metadata,
    })),
    totalResults: searchResults.length,
    responseTime,
  };
}

function createCandidateDocument(vote: any): { content: string; metadata: any } {
  const parts = [
    `Candidato: ${vote.nmCandidato || vote.nmUrnaCandidato}`,
    vote.nmUrnaCandidato && vote.nmUrnaCandidato !== vote.nmCandidato ? `Nome de urna: ${vote.nmUrnaCandidato}` : null,
    `Número: ${vote.nrCandidato}`,
    `Partido: ${vote.sgPartido} (${vote.nmPartido})`,
    `Cargo: ${vote.dsCargo}`,
    `Eleição: ${vote.dsEleicao} (${vote.anoEleicao})`,
    vote.sgUf ? `Estado: ${vote.sgUf}` : null,
    vote.nmMunicipio ? `Município: ${vote.nmMunicipio}` : null,
    `Votos: ${vote.qtVotosNominais?.toLocaleString("pt-BR") || 0}`,
    vote.dsSituacaoCandidatura ? `Situação: ${vote.dsSituacaoCandidatura}` : null,
    vote.dsSitTotTurno ? `Resultado: ${vote.dsSitTotTurno}` : null,
    vote.nmFederacao ? `Federação: ${vote.nmFederacao}` : null,
    vote.nmColigacao ? `Coligação: ${vote.nmColigacao}` : null,
  ].filter(Boolean);
  
  const content = parts.join(". ");
  
  const metadata = {
    candidateId: vote.sqCandidato,
    candidateName: vote.nmCandidato,
    ballotName: vote.nmUrnaCandidato,
    candidateNumber: vote.nrCandidato,
    partyNumber: vote.nrPartido,
    partyName: vote.nmPartido,
    votes: vote.qtVotosNominais,
    municipality: vote.nmMunicipio,
    situation: vote.dsSituacaoCandidatura,
    result: vote.dsSitTotTurno,
    federation: vote.nmFederacao,
    coalition: vote.nmColigacao,
  };
  
  return { content, metadata };
}

export async function generateEmbeddingsForImportJob(importJobId: number): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const batchSize = 100;
  let offset = 0;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  
  while (true) {
    const votes = await db
      .select()
      .from(tseCandidateVotes)
      .where(eq(tseCandidateVotes.importJobId, importJobId))
      .limit(batchSize)
      .offset(offset);
    
    if (votes.length === 0) break;
    
    const documents: {
      content: string;
      contentHash: string;
      sourceType: string;
      sourceId: number;
      year: number | null;
      state: string | null;
      electionType: string | null;
      position: string | null;
      partyAbbreviation: string | null;
      metadata: any;
    }[] = [];
    
    for (const vote of votes) {
      const { content, metadata } = createCandidateDocument(vote);
      const contentHash = hashContent(content);
      
      const existing = await db
        .select({ id: semanticDocuments.id, contentHash: semanticDocuments.contentHash })
        .from(semanticDocuments)
        .where(
          and(
            eq(semanticDocuments.sourceType, "tse_candidate"),
            eq(semanticDocuments.sourceId, vote.id)
          )
        )
        .limit(1);
      
      if (existing.length > 0 && existing[0].contentHash === contentHash) {
        skipped++;
        continue;
      }
      
      documents.push({
        content,
        contentHash,
        sourceType: "tse_candidate",
        sourceId: vote.id,
        year: vote.anoEleicao,
        state: vote.sgUf,
        electionType: vote.nmTipoEleicao,
        position: vote.dsCargo,
        partyAbbreviation: vote.sgPartido,
        metadata,
      });
    }
    
    if (documents.length > 0) {
      try {
        const texts = documents.map(d => d.content);
        const embeddings = await generateEmbeddingsBatch(texts);
        
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const embedding = embeddings[i];
          
          const existing = await db
            .select({ id: semanticDocuments.id })
            .from(semanticDocuments)
            .where(
              and(
                eq(semanticDocuments.sourceType, "tse_candidate"),
                eq(semanticDocuments.sourceId, doc.sourceId)
              )
            )
            .limit(1);
          
          if (existing.length > 0) {
            await db.execute(sql`
              UPDATE semantic_documents 
              SET content = ${doc.content},
                  content_hash = ${doc.contentHash},
                  year = ${doc.year},
                  state = ${doc.state},
                  election_type = ${doc.electionType},
                  position = ${doc.position},
                  party_abbreviation = ${doc.partyAbbreviation},
                  metadata = ${JSON.stringify(doc.metadata)}::jsonb,
                  embedding = ${`[${embedding.join(",")}]`}::vector
              WHERE id = ${existing[0].id}
            `);
          } else {
            await db.execute(sql`
              INSERT INTO semantic_documents 
              (source_type, source_id, year, state, election_type, position, party_abbreviation, content, content_hash, metadata, embedding)
              VALUES (
                ${doc.sourceType},
                ${doc.sourceId},
                ${doc.year},
                ${doc.state},
                ${doc.electionType},
                ${doc.position},
                ${doc.partyAbbreviation},
                ${doc.content},
                ${doc.contentHash},
                ${JSON.stringify(doc.metadata)}::jsonb,
                ${`[${embedding.join(",")}]`}::vector
              )
            `);
          }
          
          processed++;
        }
      } catch (err) {
        console.error("Error generating embeddings for batch:", err);
        errors += documents.length;
      }
    }
    
    offset += batchSize;
  }
  
  return { processed, skipped, errors };
}

export async function getEmbeddingStats(): Promise<{
  totalDocuments: number;
  documentsWithEmbeddings: number;
  byYear: { year: number; count: number }[];
  byState: { state: string; count: number }[];
  byParty: { party: string; count: number }[];
}> {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(semanticDocuments);
  
  const embeddedResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(semanticDocuments)
    .where(isNotNull(semanticDocuments.embedding));
  
  const byYear = await db
    .select({
      year: semanticDocuments.year,
      count: sql<number>`count(*)`,
    })
    .from(semanticDocuments)
    .where(isNotNull(semanticDocuments.year))
    .groupBy(semanticDocuments.year)
    .orderBy(desc(semanticDocuments.year));
  
  const byState = await db
    .select({
      state: semanticDocuments.state,
      count: sql<number>`count(*)`,
    })
    .from(semanticDocuments)
    .where(isNotNull(semanticDocuments.state))
    .groupBy(semanticDocuments.state)
    .orderBy(desc(sql`count(*)`));
  
  const byParty = await db
    .select({
      party: semanticDocuments.partyAbbreviation,
      count: sql<number>`count(*)`,
    })
    .from(semanticDocuments)
    .where(isNotNull(semanticDocuments.partyAbbreviation))
    .groupBy(semanticDocuments.partyAbbreviation)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  
  return {
    totalDocuments: Number(totalResult[0]?.count || 0),
    documentsWithEmbeddings: Number(embeddedResult[0]?.count || 0),
    byYear: byYear.map(r => ({ year: r.year!, count: Number(r.count) })),
    byState: byState.map(r => ({ state: r.state!, count: Number(r.count) })),
    byParty: byParty.map(r => ({ party: r.party!, count: Number(r.count) })),
  };
}

export async function getRecentQueries(limit: number = 10): Promise<SemanticSearchQuery[]> {
  const queries = await db
    .select()
    .from(semanticSearchQueries)
    .orderBy(desc(semanticSearchQueries.createdAt))
    .limit(limit);
  
  return queries as any;
}

type SemanticSearchQuery = {
  id: number;
  query: string;
  filters: any;
  resultCount: number | null;
  responseTime: number | null;
  createdAt: Date;
  createdBy: string | null;
};
