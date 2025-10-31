import natural from "natural";

export function extractKeywords(input: string): string[] {
  const stopwords = new Set([
    "find","show","latest","remote","job","jobs","for","me","the","a","an",
    "and","or","is","are","was","be","i","want","get","in","on","at","to","from",
    "with","of","by","about","as","you","we","they","your","my","our","their",
    "this","that","can","will","should","could","may","also","then","so","such",
    "here","there","all","any","each","other","some","many","most","few",
    "over","under","up","down","into","out","off","about","after","before",
    "during","while","between","within","without","like","just","now","new",
    "available","opportunity","position","role","apply","application","looking",
    "needed","required","responsibilities","experience","skills","team","work",
    "working","company","companies","organization","industry","fulltime","parttime",
    "contract","freelance","permanent","temporary","immediate","join","hiring",
    "lookingfor","open","opens","posting","post","posted","recent","updated"
  ]);

  const stemmer = natural.PorterStemmer;

  const words = input
    .toLowerCase()
    .replace(/[^\w\s+.#]/g, "") // keep . + # for tech terms
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word))
    .map(word => stemmer.stem(word)); // reduce to root

  return [...new Set(words)]; // remove duplicates
}
