import fetch from "node-fetch";
import { ContractTag } from "atq-types"; // Assuming you have a similar type definition

// Updated NFT interface to match query result structure
interface Collection {
  id: string;
  symbol: string;
  name: string;
}

interface GraphQLResponse {
  data?: {
    collections: Collection[];
  };
  errors?: { message: string }[]; // Assuming the API might return errors in this format
}

const SUBGRAPH_URLS: Record<string, { decentralized: string }> = {
  "1": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmSh9t7NhTXGUJe6KZCzp2jV2Vz51ctPmg2vfdDPKzPUvH", // Ethereum ERC1155 deployment, by BuildersDAO
  },
  "137": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmdTo1njL1YGUzTb7zPjgYTkWHrUikF6tsyjhoTmDFSQBb", // Polygon ERC1155 deployment, by BuildersDAO
  },
  "42161": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmT1T3wrEePV2eB4wBZjiB4upzwiqhAZixSj2ZaKGjM5Tw", // Arbitrum ERC1155 deployment, by BuildersDAO
  },
  "10": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmexMXUmZeTE8tK4CPnwJ9yqQMzgD7LfnrSXiGDPpoEXNa", // Optimism ERC1155 deployment, by BuildersDAO
  },
  "8453": {
    decentralized:
      "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/deployments/id/QmcvFcQsLnxWEt5ibiDpMcvH6dP6scrL2rG7aL9kKrAK9V", // Base ERC1155 deployment, by BuildersDAO
  },
};

const GET_POOLS_QUERY = `
  query GetPools($last_id: String!) {
    collections(
      first: 1000,
      orderBy: id,
      orderDirection: asc,
      where: { id_gt: $last_id }
    ) {
      id
      symbol
      name
    }
  }
`;

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

function isError(e: unknown): e is Error {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as Error).message === "string"
  );
}

function prepareUrl(chainId: string, apiKey: string): string {
  const urls = SUBGRAPH_URLS[chainId];
  if (!urls || isNaN(Number(chainId))) {
    const supportedChainIds = Object.keys(SUBGRAPH_URLS).join(", ");
    throw new Error(
      `Unsupported or invalid Chain ID provided: ${chainId}. Only the following values are accepted: ${supportedChainIds}`
    );
  }
  return urls.decentralized.replace("[api-key]", encodeURIComponent(apiKey));
}

async function fetchData(
  subgraphUrl: string,
  last_id: string
): Promise<Collection[]> {
  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: GET_POOLS_QUERY,
      variables: { last_id },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = (await response.json()) as GraphQLResponse;
  if (result.errors) {
    result.errors.forEach((error) => {
      console.error(`GraphQL error: ${error.message}`);
    });
    throw new Error("GraphQL errors occurred: see logs for details.");
  }

  if (!result.data || !result.data.collections) {
    throw new Error("No NFT data found.");
  }

  return result.data.collections;
}

function truncateString(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "..."; // Subtract 3 for the ellipsis
  }
  return text;
}

function transformPoolsToTags(
  chainId: string,
  collections: Collection[]
): ContractTag[] {
  return collections.reduce((acc: ContractTag[], collection) => {
    try {
      const maxSymbolsLength = 45;
      const symbolText = collection.symbol.trim();
      const truncatedSymbolText = truncateString(symbolText, maxSymbolsLength);

      const tag: ContractTag = {
        "Contract Address": `eip155:${chainId}:${collection.id}`,
        "Public Name Tag": `${truncatedSymbolText} token`,
        "Project Name": collection.name,
        "UI/Website Link": ``,
        "Public Note": `The ERC1155 contract for the ${collection.name} (${collection.symbol}) token.`,
      };

      acc.push(tag);
    } catch (error) {
      console.error(
        `Error processing collection ${JSON.stringify(collection)}:`,
        error
      );
    }
    return acc;
  }, []);
}

class TagService {
  returnTags = async (
    chainId: string,
    apiKey: string
  ): Promise<ContractTag[]> => {
    let last_id: string = "0";
    let allTags: ContractTag[] = [];
    let isMore = true;
    const url = prepareUrl(chainId, apiKey);

    while (isMore) {
      try {
        const nfts = await fetchData(url, last_id);
        allTags.push(...transformPoolsToTags(chainId, nfts));
        console.log(`Currently at: ${allTags.length}`);

        isMore = nfts.length === 1000;
        if (isMore) {
          last_id = nfts[nfts.length - 1].id;
        }
      } catch (error) {
        if (isError(error)) {
          console.error(`An error occurred: ${error.message}`);
          throw new Error(`Failed fetching data: ${error}`); // Propagate a new error with more context
        } else {
          console.error("An unknown error occurred.");
          throw new Error("An unknown error occurred during fetch operation."); // Throw with a generic error message if the error type is unknown
        }
      }
    }
    return allTags;
  };
}

const tagService = new TagService();
export const returnTags = tagService.returnTags;
