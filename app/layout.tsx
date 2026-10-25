import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'こそだて日和 | 妊娠・出産・子育ての情報サイト',description:'妊娠中から小学生まで。月齢に合った育児、手続き、買い物をひとつに。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
