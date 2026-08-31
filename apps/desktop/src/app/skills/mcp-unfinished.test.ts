import { describe, expect, it } from 'vitest'

import { unfinishedServers } from './mcp-tab'

describe('unfinishedServers', () => {
  // The failure this guards: "Add server" seeds an entry meant to be edited,
  // and saving it unedited is silent — the server cannot start, so the
  // launcher retries every few seconds forever. One ran for a day and a half,
  // roughly 25,000 lines of "Cannot access directory /path/to/dir".
  it('names a server still on the starter placeholder', () => {
    const entries = {
      'my-server': { args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'], command: 'npx' }
    }

    expect(unfinishedServers(entries)).toEqual(['my-server'])
  })

  it('passes a server whose path has been filled in', () => {
    const entries = {
      files: { args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/prince/notes'], command: 'npx' }
    }

    expect(unfinishedServers(entries)).toEqual([])
  })

  it('names every unfinished one, not just the first', () => {
    const starter = ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir']
    const entries = {
      'my-server': { args: starter, command: 'npx' },
      'my-server-2': { args: starter, command: 'npx' },
      ok: { args: ['-y', 'x', '/real/path'], command: 'npx' }
    }

    expect(unfinishedServers(entries).sort()).toEqual(['my-server', 'my-server-2'])
  })

  // A URL-transport server has no args at all; it must not trip the check.
  it('ignores an entry with no args', () => {
    expect(unfinishedServers({ airtable: { url: 'https://mcp.airtable.com/mcp' } })).toEqual([])
  })

  it('is empty for an empty document', () => {
    expect(unfinishedServers({})).toEqual([])
  })
})
