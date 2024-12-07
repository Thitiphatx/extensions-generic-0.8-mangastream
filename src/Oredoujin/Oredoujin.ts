import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ContentRating,
    PagedResults,
    PartialSourceManga,
    SearchRequest,
    SourceInfo,
    SourceIntents
} from '@paperback/types'
import {
    BasicAcceptedElems,
    CheerioAPI,
    Cheerio
} from 'cheerio'
import { AnyNode } from 'domhandler'
import * as cheerio from 'cheerio'
import { convertDate } from '../LanguageUtils'
import { decode as decodeHTMLEntity } from 'html-entities'


import {
    getExportVersion,
    MangaStream
} from '../MangaStream'

const DOMAIN = 'https://oredoujin.com'

export const OredoujinInfo: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Oredoujin',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'thitiphatx',
    authorWebsite: 'http://github.com/thitiphatx',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: []
}

export class Oredoujin extends MangaStream {

    baseUrl: string = DOMAIN

    override directoryPath = 'series'

    override configureSections() {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false

        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('div.bsx', $('h3:contains(อัปเดตล่าสุดเมื่อ)')?.parent()?.next())
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('span.nchapter', element).first().text().trim()
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        const request = App.createRequest({
            url: `${this.baseUrl}/page/${page}/?s=${query.title}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)
        const results = await parseSearchResults($, this)

        const manga: PartialSourceManga[] = []
        for (const result of results) {
            let mangaId: string = result.slug
            if (await this.getUsePostIds()) {
                mangaId = await this.slugToPostId(result.slug, result.path)
            }

            manga.push(App.createPartialSourceManga({
                mangaId,
                image: result.image,
                title: result.title,
                subtitle: result.subtitle
            }))
        }

        metadata = !this.parser.isLastPage($, 'view_more') ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }
    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: await this.getUsePostIds() ? `${this.baseUrl}/?p=${mangaId}/` : `${this.baseUrl}/${this.directoryPath}/${mangaId}/`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return parseChapterList($, mangaId, this)
    }
    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // Request the manga page
        const request = App.createRequest({
            url: await this.getUsePostIds() ? `${this.baseUrl}/?p=${mangaId}/` : `${this.baseUrl}/${this.directoryPath}/${mangaId}/`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        //const chapter = $('div#chapterlist').find('li[data-num="' + chapterId + '"]')
        const chapters = $('div.eplister.eplisterfull').find('li').toArray()
        if (chapters.length === 0) {
            throw new Error(`Unable to fetch chapter list for manga with mangaId: ${mangaId}`)
        }

        const chapter = chapters.find(x => $(x).attr('data-id') === chapterId)
        if (!chapter) {
            throw new Error(`Unable to fetch a chapter for chapter number: ${chapterId}`)
        }

        // Fetch the ID (URL) of the chapter
        const id = $('a', chapter).attr('href') ?? ''
        if (!id) {
            throw new Error(`Unable to fetch id for chapter with chapter id: ${chapterId}`)
        }
        // Request the chapter page
        const _request = App.createRequest({
            url: id,
            method: 'GET'
        })

        const _response = await this.requestManager.schedule(_request, 1)
        this.checkResponseError(_response)
        const _$ = cheerio.load(_response.data as string)

        return parseChapterDetails(_$, mangaId, chapterId)
    }
}

function parseSearchResults($: CheerioAPI, source: any): Promise<any[]> {
    const results: any[] = []
    for (const obj of $('div.listupd > article.maindet > div.inmain').toArray()) {
        const slug: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').pop() ?? ''
        const path: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
        if (!slug || !path) {
            throw new Error(`Unable to parse slug (${slug}) or path (${path})!`)
        }

        const title: string = $('a', obj).attr('title') ?? ''
        const image = encodeURI(decodeURI(decodeHTMLEntity($('a > img', obj).attr("src")?.trim()))) ?? ''
        const subtitle = $('div.mdinfo > div.mdinfodet > span.nchapter > a', obj).text().trim() ?? ''

        results.push({
            slug,
            path,
            image: image || source.fallbackImage,
            title: decodeHTMLEntity(title),
            subtitle: decodeHTMLEntity(subtitle)
        })
    }

    return results
}

function parseChapterList($: CheerioAPI, mangaId: string, source: any): Chapter[] {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    for (const chapter of $('li', 'div.eplister.eplisterfull').toArray()) {
        const title = decodeHTMLEntity($('div.epl-title', chapter).text().trim())
        const date = convertDate($('div.epl-date', chapter).text().trim(), source)
        // Set data-num attribute as id
        const id = chapter.attribs['data-id'] ?? ''
        const chapterNumberRegex = title.match(/(\d+\.?\d?)+/)
        let chapterNumber = 0
        if (chapterNumberRegex && chapterNumberRegex[1]) {
            chapterNumber = Number(chapterNumberRegex[1])
        }

        if (!id || typeof id === 'undefined') {
            throw new Error(`Could not parse out ID when getting chapters for postId: ${mangaId}`)
        }

        chapters.push({
            id: id,
            langCode: '🇹🇭',
            chapNum: chapterNumber,
            name: title,
            time: date,
            sortingIndex,
            volume: 0,
            group: ''
        })
        sortingIndex--
    }

    // If there are no chapters, throw error to avoid losing progress
    if (chapters.length == 0) {
        throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
    }

    return chapters.map((chapter) => {
        chapter.sortingIndex += chapters.length
        return App.createChapter(chapter)
    })
}

function parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails {
    const pages: string[] = []
    for (const page of $('img', `#post-${chapterId} > div.bixbox.episodedl > div > div.epcontent.entry-content > center > p`).toArray()) {
        pages.push($(page).attr('src') ?? "");
    }
    const chapterDetails = App.createChapterDetails({
        id: chapterId,
        mangaId: mangaId,
        pages: pages
    })

    return chapterDetails
}