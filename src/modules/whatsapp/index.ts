import { ContentExtractor } from "./extractors/ContentExtractor";

const extractor = new ContentExtractor();

const message = `
  4/9/25，rpt

total：216

khong  sieaw mei 

contact: 010-935 3310 

address: No8,Jalan Mawar Jaya 1-1 ,Taman Mawar Jaya,28300 Triang Pahang Malaysia

2w2f2s1w30ml1f10ml10b1f30ml
`;

const result = extractor.extractAll(message);

console.log(result);