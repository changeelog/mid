import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { Browser, Page } from 'puppeteer'
import fs from 'fs'
import path from 'path'
import winston from 'winston'

puppeteer.use(StealthPlugin())

/**
 * Represents a news item with its details
 * @param {string} date - The date of the news item
 * @param {string} time - The time of the news item
 * @param {string} title - The title of the news item
 * @param {string} link - The link to the news item
 * @param {string[]} tags - An array of tags associated with the news item
 */
interface NewsItem {
  date: string
  time: string
  title: string
  link: string
  tags: string[]
}

/**
 * Configure Winston logger
 */
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
})

class NewsFeedFetcher {
  private browser: Browser | null = null
  private page: Page | null = null

  /**
   * Initialize the browser and page
   * @throws {Error} If browser initialization fails
   */
  async initialize(): Promise<void> {
    try {
      const browserOptions: any = {
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
      }

      this.browser = await puppeteer.launch(browserOptions)
      this.page = await this.browser.newPage()

      // Set user agent to avoid detection
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      )

      // Set extra headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      })
      logger.info('Browser initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize browser:', error)
      throw new Error('Browser initialization failed')
    }
  }

  /**
   * Fetch content from the specified page number
   * @param {number} pageNumber - The page number to fetch (default: 1)
   * @returns {Promise<NewsItem[]>} Array of news items
   * @throws {Error} If fetching fails
   */
  async getContent(pageNumber: number = 1): Promise<NewsItem[]> {
    if (!this.page) throw new Error('Browser not initialized')

    try {
      const url =
        pageNumber === 1
          ? 'https://mid.ru/ru/foreign_policy/news/'
          : `https://mid.ru/ru/foreign_policy/news/?PAGEN_1=${pageNumber}`

      logger.info(`Fetching page ${pageNumber}...`)
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })

      // Wait for the content to load
      await this.page
        .waitForSelector('.announce.announce_articles', { timeout: 10000 })
        .catch(() => {
          logger.warn('Timeout waiting for .announce.announce_articles')
        })

      // Check for anti-bot protection
      const pageContent = await this.page.content()
      if (pageContent.includes('Data processing... Please, wait.')) {
        logger.info('Anti-bot protection detected. Waiting for page to load...')
        await this.page
          .waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
          .catch(() => logger.warn('Timeout waiting for navigation'))
      }

      // Extract news items from the page
      const newsItems = await this.page.evaluate(() => {
        const items: NewsItem[] = []
        const announceList = document.querySelector(
          '.announce.announce_articles',
        )
        if (!announceList) return items

        const announceItems = announceList.querySelectorAll('.announce__item')

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

      logger.info(`Found ${newsItems.length} news items on page ${pageNumber}`)
      return newsItems
    } catch (error) {
      logger.error(`Error fetching content from page ${pageNumber}:`, error)
      throw new Error(`Failed to fetch content from page ${pageNumber}`)
    }
  }

  /**
   * Save news items to a JSON file
   * @param {NewsItem[]} data - Array of news items to save
   * @param {string} filename - Name of the file to save the data
   * @throws {Error} If saving fails
   */
  async saveToJSON(data: NewsItem[], filename: string): Promise<void> {
    try {
      const dir = './output'
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const filePath = path.join(dir, filename)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
      logger.info(`Data saved to ${filePath}`)
    } catch (error) {
      logger.error('Error saving data to JSON:', error)
      throw new Error('Failed to save data to JSON')
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      logger.info('Browser closed')
    }
  }
}


async function main() {
  const fetcher = new NewsFeedFetcher()
  try {
    await fetcher.initialize()

    const newsItems = await fetcher.getContent(1)

    await fetcher.saveToJSON(newsItems, 'news_feed.json')

    logger.info(`Total news items fetched: ${newsItems.length}`)
  } catch (error) {
    logger.error('An error occurred:', error)
  } finally {
    await fetcher.close()
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main function:', error)
  process.exit(1)
})
