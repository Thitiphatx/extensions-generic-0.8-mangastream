import {
    ContentRating,
    SourceInfo,
    SourceIntents
} from '@paperback/types'
import {
    BasicAcceptedElems,
    CheerioAPI,
} from 'cheerio'
import { AnyNode } from 'domhandler'


import {
    getExportVersion,
    MangaStream
} from '../MangaStream'

const DOMAIN = 'https://manga168.net'

export const Manga168Info: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Manga168',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'thitiphatx',
    authorWebsite: 'http://github.com/thitiphatx',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: []
}

export class Manga168 extends MangaStream {

    baseUrl: string = DOMAIN

    override directoryPath = 'series'

    override configureSections() {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false

        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('div.uta > div.imgu', $('h2:contains(อัพเดทล่าสุด)')?.parent()?.next())
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('ul > li:nth-child(1) > a', $(element).parent()).text().trim()
    }
}
