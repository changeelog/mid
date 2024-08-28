import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { Browser, Page } from 'puppeteer'
import fs from 'fs'
import path from 'path'

puppeteer.use(StealthPlugin())

interface NewsItem {
  date: string
  time: string
  title: string
  link: string
  tags: string[]
}

class NewsFeedFetcher {
  private browser: Browser | null = null
  private page: Page | null = null

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    })
    this.page = await this.browser.newPage()
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    )
  }

  async getContent(pageNumber: number = 1): Promise<NewsItem[]> {
    if (!this.page) throw new Error('Browser not initialized')

    const url =
      pageNumber === 1
        ? 'https://mid.ru/ru/foreign_policy/news/'
        : `https://mid.ru/ru/foreign_policy/news/?PAGEN_1=${pageNumber}`

    console.log(`Fetching page ${pageNumber}...`)
    await this.page.goto(url, { waitUntil: 'networkidle0' })

    const newsItems = await this.page.evaluate(() => {
      const items: NewsItem[] = []
      const announceItems = document.querySelectorAll('.announce__item')

      announceItems.forEach((item) => {
        const dateElement = item.querySelector('.announce__date')
        const timeElement = item.querySelector('.announce__time')
        const linkElement = item.querySelector(
          '.announce__link',
        ) as HTMLAnchorElement
        const tagsElement = item.querySelector('.announce__meta-tags')

        if (dateElement && timeElement && linkElement) {
          items.push({
            date: dateElement.textContent?.trim() || '',
            time: timeElement.textContent?.trim() || '',
            title: linkElement.textContent?.trim() || '',
            link: linkElement.href,
            tags: tagsElement
              ? tagsElement.textContent?.trim().split(', ') || []
              : [],
          })
        }
      })

      return items
    })

    return newsItems
  }

  async saveToJSON(data: NewsItem[], filename: string): Promise<void> {
    const dir = './output'
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const filePath = path.join(dir, filename)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    console.log(`Data saved to ${filePath}`)
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
    }
  }
}

async function main() {
  const fetcher = new NewsFeedFetcher()
  try {
    await fetcher.initialize()

    const newsItems = await fetcher.getContent(1)

    await fetcher.saveToJSON(newsItems, 'news_feed.json')

    console.log(`Total news items fetched: ${newsItems.length}`)
  } catch (error) {
    console.error('An error occurred:', error)
  } finally {
    await fetcher.close()
  }
}

main()
