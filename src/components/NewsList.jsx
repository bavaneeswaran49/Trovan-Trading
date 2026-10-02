import { Empty, Fields } from './DataView'
import Icon from './Icon'
import { label, safeUrl } from '../utils/format'
// The v1 response schema is unspecified. Display only fields in the response.
export default function NewsList({ data }) {
  if (!Array.isArray(data)) return <Fields data={data}/>
  if (!data.length) return <Empty title="No news available" message="Check back for the latest market stories."/>
  return <div className="news-grid">{data.map((article, i) => {
    if (!article || typeof article !== 'object') return <Fields key={i} data={article}/>
    const entries = Object.entries(article)
    const find = keys => entries.find(([key, value]) => keys.includes(key.toLowerCase()) && typeof value === 'string' && value.trim())
    const title = find(['title', 'headline']), image = find(['image', 'image_url', 'imageurl', 'thumbnail']), link = find(['url', 'link', 'article_url'])
    const description = find(['description', 'summary']), source = find(['source', 'source_name', 'publisher']), date = find(['date', 'published_at', 'published_date', 'publishedat', 'pubdate'])
    const used = [title, image, link, description, source, date].filter(Boolean).map(([key]) => key)
    return <article className="news-card" key={link?.[1] || i}>
      {image && safeUrl(image[1]) && <img src={safeUrl(image[1])} loading="lazy" referrerPolicy="no-referrer" alt=""/>}
      {source && <span className="eyebrow" style={{ marginBottom: 12 }}>{source[1]}</span>}
      {title && <h2>{title[1]}</h2>}{description && <p>{description[1]}</p>}
      {date && <p className="news-date">{label(date[0])}: {date[1]}</p>}
      {link && safeUrl(link[1]) && <a className="text-link" href={safeUrl(link[1])} target="_blank" rel="noopener noreferrer">Read the story <Icon name="arrow" size={14}/></a>}
      {entries.some(([key]) => !used.includes(key)) && <Fields data={Object.fromEntries(entries.filter(([key]) => !used.includes(key)))}/>}
    </article>
  })}</div>
}
