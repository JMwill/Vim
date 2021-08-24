import { Position } from 'vscode';
import { TextDocument } from 'vscode';
import { QuoteMatcher } from '../../../common/matching/quoteMatcher';
import { configuration } from '../../../configuration/configuration';

type Quote = '"' | "'" | '`';
enum QuoteMatch {
  Opening,
  Closing,
}
export type WhichQuotes = 'current' | 'next' | 'last';
type Dir = '>' | '<';
type SearchAction = {
  first: Dir;
  second: Dir;
  includeCurrent: boolean;
};
type QuotesAction = {
  search: SearchAction | undefined;
  skipToLeft: number; // for last quotes, how many quotes need to skip while searching
  skipToRight: number; // for next quotes, how many quotes need to skip while searching
};

const quoteDirs: Record<string, QuotesAction> = {
  '002': {
    // | "a" "b" "c"
    search: { first: '>', second: '>', includeCurrent: false },
    skipToLeft: 0,
    skipToRight: 1,
  },
  '012': {
    // |"a" "b" "c" "
    search: { first: '>', second: '>', includeCurrent: true },
    skipToLeft: 0,
    skipToRight: 2,
  },
  '102': {
    // "a" "|b" "c" "
    search: { first: '<', second: '>', includeCurrent: false },
    skipToLeft: 2,
    skipToRight: 2,
  },
  '112': {
    //  "a" "b|" "c"
    search: { first: '<', second: '<', includeCurrent: true },
    skipToLeft: 2,
    skipToRight: 1,
  },
  '202': {
    //  "a"| "b" "c"
    search: { first: '>', second: '>', includeCurrent: false },
    skipToLeft: 1,
    skipToRight: 1,
  },
  '211': {
    //  "a" |"b" "c"
    search: { first: '>', second: '>', includeCurrent: true },
    skipToLeft: 1,
    skipToRight: 2,
  },
  '101': {
    //  "a" "|b" "c"
    search: { first: '<', second: '>', includeCurrent: false },
    skipToLeft: 2,
    skipToRight: 2,
  },
  '011': {
    //  |"a" "b" "c"
    search: { first: '>', second: '>', includeCurrent: true },
    skipToLeft: 0,
    skipToRight: 2,
  },
  '110': {
    //  "a" "b" "c|"
    search: { first: '<', second: '<', includeCurrent: true },
    skipToLeft: 2,
    skipToRight: 0,
  },
  '212': {
    //  "a" |"b" "c" "
    search: { first: '>', second: '>', includeCurrent: true },
    skipToLeft: 1,
    skipToRight: 2,
  },
  '111': {
    //  "a" "b|" "c" "
    search: { first: '<', second: '<', includeCurrent: true },
    skipToLeft: 2,
    skipToRight: 1,
  },
  '200': {
    //  "a" "b" "c"|
    search: { first: '<', second: '<', includeCurrent: false },
    skipToLeft: 1,
    skipToRight: 0,
  },
  '201': {
    //  "a" "b" "c"| "
    //  "a"| "b" "c" "
    search: { first: '>', second: '>', includeCurrent: false },
    skipToLeft: 1,
    skipToRight: 1,
  },
  '210': {
    //  "a" "b" "c" |"
    search: undefined,
    skipToLeft: 1,
    skipToRight: 0,
  },
  '001': {
    // | "a" "b" "c" "
    search: undefined,
    skipToLeft: 0,
    skipToRight: 1,
  },
  '010': {
    //  a|"b
    search: undefined,
    skipToLeft: 0,
    skipToRight: 0,
  },
  '100': {
    //  "a" "b" "c" "|
    search: undefined,
    skipToLeft: 2,
    skipToRight: 0,
  },
  '000': {
    //  |ab
    search: undefined,
    skipToLeft: 0,
    skipToRight: 0,
  },
};

type SearchState = { position: Position; quoteMap: QuoteMatch[] };
export class SmartQuoteMatcher {
  static readonly escapeChar = '\\';

  private document: TextDocument;
  private quote: Quote;

  constructor(quote: Quote, document: TextDocument) {
    this.quote = quote;
    this.document = document;
  }

  private buildQuoteMap(text: string) {
    const quoteMap: QuoteMatch[] = [];
    let openingQuote = true;
    // Loop over text, marking quotes and respecting escape characters.
    for (let i = 0; i < text.length; i++) {
      if (text[i] === QuoteMatcher.escapeChar) {
        i += 1;
        continue;
      }
      if (text[i] === this.quote) {
        quoteMap[i] = openingQuote ? QuoteMatch.Opening : QuoteMatch.Closing;
        openingQuote = !openingQuote;
      }
    }
    return quoteMap;
  }

  // static createMatcher(
  //   quote: '"' | "'" | '`',
  //   document: TextDocument,
  //   position: Position,
  //   which: WhichQuotes
  // ): [SmartQuoteMatcher, Position, WhichQuotes] | undefined {
  //   const searchLine = (
  //     i: number,
  //     direction: Dir
  //   ): [SmartQuoteMatcher, Position, WhichQuotes] | undefined => {
  //     const sameAsInputLine = i === position.line;
  //     const lineText = document.lineAt(i).text;
  //     let matchIndex = -1;
  //     if (direction === '<') {
  //       const fromIndex = sameAsInputLine ? position.character - 1 : +Infinity;
  //       matchIndex = lineText.lastIndexOf(quote, fromIndex);
  //     } else {
  //       const fromIndex = sameAsInputLine ? position.character + 1 : 0;
  //       matchIndex = lineText.indexOf(quote, fromIndex);
  //     }

  //     if (matchIndex >= 0) {
  //       const positionToReturn = sameAsInputLine ? position : new Position(i, matchIndex);
  //       const whichToReturn = sameAsInputLine ? which : 'current';
  //       return [new SmartQuoteMatcher(quote, lineText), positionToReturn, whichToReturn];
  //     } else {
  //       return undefined;
  //     }
  //   };

  //   if (!configuration.smartQuotes.breakThroughLines || which === 'current') {
  //     return [new SmartQuoteMatcher(quote, document.lineAt(position.line).text), position, which];
  //   } else if (which === 'next') {
  //     // search forward
  //     for (let i = position.line; i < document.lineCount; ++i) {
  //       const lineRes = searchLine(i, '>');
  //       if (lineRes) return lineRes;
  //     }
  //   } else {
  //     // which === 'last'
  //     // search backward
  //     for (let i = position.line; i >= 0; --i) {
  //       const lineRes = searchLine(i, '<');
  //       if (lineRes) return lineRes;
  //     }
  //   }
  //   return undefined;
  // }
  private static lineSearchAction(cursorIndex: number, quoteMap: QuoteMatch[]) {
    // base on ideas from targets.vim

    // cut line in left of, on and right of cursor
    const left = Array.from(quoteMap.entries()).slice(undefined, cursorIndex);
    const cursor = quoteMap[cursorIndex];
    const right = Array.from(quoteMap.entries()).slice(cursorIndex + 1, undefined);

    // how many delimiters left, on and right of cursor
    const lc = left.filter(([_, v]) => v !== undefined).length;
    const cc = cursor !== undefined ? 1 : 0;
    const rc = right.filter(([_, v]) => v !== undefined).length;

    // truncate counts
    const lct = lc === 0 ? 0 : lc % 2 === 0 ? 2 : 1;
    const rct = rc === 0 ? 0 : rc >= 2 ? 2 : 1;

    const key = `${lct}${cc}${rct}`;
    const act = quoteDirs[key];

    return act;
  }

  public smartSurroundingQuotes(
    position: Position,
    which: WhichQuotes
  ): { start: Position; stop: Position; lineText: string } | undefined {
    position = this.document.validatePosition(position);
    const cursorIndex = position.character;
    const lineText = this.document.lineAt(position).text;
    const quoteMap = this.buildQuoteMap(lineText);

    const act = SmartQuoteMatcher.lineSearchAction(cursorIndex, quoteMap);

    if (which === 'current') {
      if (act.search) {
        const searchRes = this.smartSearch(cursorIndex, act.search, quoteMap);
        return searchRes
          ? {
              start: position.with({ character: searchRes[0] }),
              stop: position.with({ character: searchRes[1] }),
              lineText,
            }
          : undefined;
      } else {
        return undefined;
      }
    } else if (which === 'next') {
      // search quote in current line
      const right = Array.from(quoteMap.entries()).slice(cursorIndex + 1, undefined);
      const [index, found] = right.filter(([i, v]) => v !== undefined)[act.skipToRight] ?? [
        +Infinity,
        undefined,
      ];
      // find next position for surrounding quotes, possibly breaking through lines
      let nextPos;
      position = position.with({ character: index });
      if (found === undefined && configuration.smartQuotes.breakThroughLines) {
        // nextPos = State.evalGenerator(this.getNextQuoteThroughLineBreaks(), position);
        nextPos = this.getNextQuoteThroughLineBreaks(position);
      } else {
        nextPos = found !== undefined ? position : undefined;
      }

      // find surrounding with new position
      if (nextPos) {
        return this.smartSurroundingQuotes(nextPos, 'current');
      } else {
        return undefined;
      }
    } else if (which === 'last') {
      // search quote in current line
      const left = Array.from(quoteMap.entries()).slice(undefined, cursorIndex);
      const [index, found] = left.reverse().filter(([i, v]) => v !== undefined)[act.skipToLeft] ?? [
        0,
        undefined,
      ];
      // find last position for surrounding quotes, possibly breaking through lines
      let lastPos;
      position = position.with({ character: index });
      if (found === undefined && configuration.smartQuotes.breakThroughLines) {
        lastPos = this.getLastQuoteThroughLineBreaks(position);
      } else {
        lastPos = found !== undefined ? position : undefined;
      }

      // find surrounding with new position
      if (lastPos) {
        return this.smartSurroundingQuotes(lastPos, 'current');
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  private smartSearch(
    start: number,
    action: SearchAction,
    quoteMap: QuoteMatch[]
  ): [number, number] | undefined {
    const offset = action.includeCurrent ? 1 : 0;
    let cursorPos: number | undefined = start;
    let fst: number | undefined;
    let snd: number | undefined;

    if (action.first === '>') {
      cursorPos = fst = this.getNextQuote(cursorPos - offset, quoteMap);
    } else {
      // dir === '<'
      cursorPos = fst = this.getPrevQuote(cursorPos + offset, quoteMap);
    }
    if (cursorPos === undefined) return undefined;

    if (action.second === '>') {
      snd = this.getNextQuote(cursorPos, quoteMap);
    } else {
      // dir === '<'
      snd = this.getPrevQuote(cursorPos, quoteMap);
    }

    if (fst === undefined || snd === undefined) return undefined;

    if (fst < snd) return [fst, snd];
    else return [snd, fst];
  }

  private getNextQuoteThroughLineBreaks(position: Position): Position | undefined {
    for (let line = position.line; line < this.document.lineCount; line++) {
      position = this.document.validatePosition(position.with({ line }));
      const text = this.document.lineAt(position).text;
      const index = text.indexOf(this.quote, position.character);
      if (index >= 0) {
        return position.with({ character: index });
      }
      position = position.with({ character: 0 }); // set at line begin for next iteration
    }
    return undefined;
  }
  private getLastQuoteThroughLineBreaks(position: Position): Position | undefined {
    for (let line = position.line; line >= 0; line--) {
      position = this.document.validatePosition(position.with({ line }));
      const text = this.document.lineAt(position).text;
      const index = text.lastIndexOf(this.quote, position.character);
      if (index >= 0) {
        return position.with({ character: index });
      }
      position = position.with({ character: +Infinity }); // set at line end for next iteration
    }
    return undefined;
  }

  private getNextQuote(start: number, quoteMap: QuoteMatch[]): number | undefined {
    for (let i = start + 1; i < quoteMap.length; i++) {
      if (quoteMap[i] !== undefined) {
        return i;
      }
    }

    return undefined;
  }

  private getPrevQuote(start: number, quoteMap: QuoteMatch[]): number | undefined {
    for (let i = start - 1; i >= 0; i--) {
      if (quoteMap[i] !== undefined) {
        return i;
      }
    }

    return undefined;
  }
}