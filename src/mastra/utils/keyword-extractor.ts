//Add more tech keywords as needed
export function extractKeywords(input: string): string[] {
  const stopwords = [
    "find", "show", "latest", "remote", "job", "jobs", "for", "me", "the",
    "a", "an", "and", "or", "is", "are", "was", "be", "i", "want", "get",
    "in", "on", "at", "to", "from", "with", "of", "by", "about", "as",
    "you", "we", "they", "your", "my", "our", "their", "this", "that"
  ];

  const words = input
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.includes(word));

  return [...new Set(words)]; // Remove duplicates
}
