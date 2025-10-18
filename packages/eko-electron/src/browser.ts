import { LanguageModelV2Prompt, Tool } from "@jarvis-agent/core/types";
import { AgentContext, BaseBrowserLabelsAgent } from "@jarvis-agent/core";
import { BrowserView, WebContentsView } from "electron";
// import { store } from "../../electron/main/utils/store"; // External dependency - should be injected

export default class BrowserAgent extends BaseBrowserLabelsAgent {

  private detailView: WebContentsView;

  constructor(detailView: WebContentsView, mcpClient?: any) {
    super(['default'], [], mcpClient);
    this.detailView = detailView;
  }

  protected async double_screenshots(
    agentContext: AgentContext,
    messages: LanguageModelV2Prompt,
    tools: Tool[]
  ): Promise<boolean> {
    return false;
  }

  protected async screenshot(
    agentContext: AgentContext
  ): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }> {
    const image = await this.detailView.webContents.capturePage()
    return { imageBase64: image.toDataURL(), imageType: "image/jpeg" }
  }

  protected async navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{ url: string; title?: string }> {
    await this.detailView.webContents.loadURL(url);
    await this.sleep(200);
    return {
      url: this.detailView.webContents.getURL(),
      title: this.detailView.webContents.getTitle(),
    };
  }

  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {

    const viewWebContents = this.detailView.webContents;

  const code = `(async() => {
    const func = ${func};
    const result = await func(...${JSON.stringify(args)});
    return result;
})()`

  console.log("invoke-view-func code", code);
  const result = await viewWebContents.executeJavaScript(code, true)

  console.log("invoke-view-func result", result);
  return result;
  }

  private async size(): Promise<[number, number]> {
    const width = this.detailView.getBounds().width;
    const height = this.detailView.getBounds().height;
    return [width, height]
  }

  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }

  protected async get_all_tabs(
    agentContext: AgentContext
  ): Promise<Array<{ tabId: number; url: string; title: string }>> {
    const url = this.detailView.webContents.getURL();
    const title = this.detailView.webContents.getTitle();
    return [
      {
        tabId: 0,
        url,
        title,
      },
    ];
  }

  protected async switch_tab(
    agentContext: AgentContext,
    tabId: number
  ): Promise<{ tabId: number; url: string; title: string }> {
    return (await this.get_all_tabs(agentContext))[0];
  }

  protected async go_back(agentContext: AgentContext): Promise<void> {
    if (this.detailView.webContents.navigationHistory.canGoBack()) {
      this.detailView.webContents.navigationHistory.goBack();
      await this.sleep(200);
    }
  }

  // NOTE: This method requires external store dependency - commented out for npm package
  // protected async get_xiaohongshu_video_url(xiaohongshuUrl: string): Promise<string> {
  //   try {
  //     // 从Electron store获取视频地址
  //     const videoUrlMap = store.get('videoUrlMap', {});
  //     const videoInfo = videoUrlMap[xiaohongshuUrl];

  //     if (videoInfo && videoInfo.platform === 'xiaohongshu' && videoInfo.videoUrl) {
  //       console.log('从store中获取到小红书视频地址:', videoInfo.videoUrl);
  //       return videoInfo.videoUrl;
  //     } else {
  //       throw new Error('未找到该小红书页面的视频地址，请先在detailView中打开页面');
  //     }
  //   } catch (error) {
  //     console.error('获取小红书视频地址失败:', error);
  //     throw new Error(`获取视频地址失败: ${error instanceof Error ? error.message : '未知错误'}`);
  //   }
  // }

  // 重写 extract_page_content 方法以支持PDF
  protected async extract_page_content(agentContext: AgentContext): Promise<any> {
    const currentUrl = this.detailView.webContents.getURL();

    // 检测是否为PDF页面
    if (this.isPdfUrl(currentUrl) || await this.isPdfPage(agentContext)) {
      return await this.extractPdfContent(agentContext);
    }

    // 调用父类的HTML内容提取
    return await super.extract_page_content(agentContext);
  }

  // 检测URL是否为PDF
  private isPdfUrl(url: string): boolean {
    return url.toLowerCase().includes('.pdf') ||
           url.includes('application/pdf') ||
           url.includes('viewer.html') || // Chrome PDF viewer
           url.includes('#page='); // PDF页面锚点
  }

  // 检测当前页面是否为PDF
  private async isPdfPage(agentContext: AgentContext): Promise<boolean> {
    try {
      return await this.execute_script(agentContext, () => {
        // 检测PDF查看器特征
        return document.querySelector('embed[type="application/pdf"]') !== null ||
               document.querySelector('iframe[src*=".pdf"]') !== null ||
               document.querySelector('#viewer') !== null || // Chrome PDF viewer
               document.querySelector('.pdfViewer') !== null || // Firefox PDF viewer
               document.contentType === 'application/pdf' ||
               window.location.href.includes('viewer.html');
      }, []);
    } catch (error) {
      console.warn('PDF检测失败:', error);
      return false;
    }
  }

  // 提取PDF内容
  private async extractPdfContent(agentContext: AgentContext): Promise<any> {
    try {
      return await this.execute_script(agentContext, () => {
        return new Promise(async (resolve) => {
          try {
            // 动态加载PDF.js
            if (!(window as any).pdfjsLib) {
              console.log('开始加载PDF.js库...');

              // 加载PDF.js主文件
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
              script.crossOrigin = 'anonymous';

              await new Promise((scriptResolve, scriptReject) => {
                script.onload = () => {
                  console.log('PDF.js主文件加载成功');
                  scriptResolve(true);
                };
                script.onerror = () => {
                  console.error('PDF.js主文件加载失败');
                  scriptReject(new Error('PDF.js加载失败'));
                };
                document.head.appendChild(script);
              });

              // 配置worker
              (window as any).pdfjsLib!.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

              console.log('PDF.js配置完成');
            }

            // 获取PDF URL
            let pdfUrl = window.location.href;

            // 尝试从各种PDF容器中获取实际PDF URL
            const embedEl = document.querySelector('embed[type="application/pdf"]') as HTMLEmbedElement;
            const iframeEl = document.querySelector('iframe[src*=".pdf"]') as HTMLIFrameElement;

            if (embedEl && embedEl.src && embedEl.src !== 'about:blank' && !embedEl.src.startsWith('about:')) {
              pdfUrl = embedEl.src;
            } else if (iframeEl && iframeEl.src && iframeEl.src !== 'about:blank' && !iframeEl.src.startsWith('about:')) {
              pdfUrl = iframeEl.src;
            } else if (window.location.href.includes('viewer.html')) {
              // Chrome PDF viewer格式: chrome://pdf-viewer/index.html?src=URL
              const urlParams = new URLSearchParams(window.location.search);
              const srcParam = urlParams.get('src') || urlParams.get('file');
              if (srcParam) {
                pdfUrl = decodeURIComponent(srcParam);
              }
            } else if (pdfUrl === window.location.href && (pdfUrl === 'about:blank' || pdfUrl.startsWith('about:'))) {
              // 如果当前URL也是about:blank，尝试其他方法获取真实PDF URL
              // 检查页面中是否有其他包含PDF URL的线索
              const allEmbeds = document.querySelectorAll('embed');
              const allIframes = document.querySelectorAll('iframe');

              for (const embed of Array.from(allEmbeds)) {
                const src = (embed as HTMLEmbedElement).src;
                if (src && src.includes('.pdf') && !src.startsWith('about:')) {
                  pdfUrl = src;
                  break;
                }
              }

              if (pdfUrl === window.location.href || pdfUrl.startsWith('about:')) {
                for (const iframe of Array.from(allIframes)) {
                  const src = (iframe as HTMLIFrameElement).src;
                  if (src && src.includes('.pdf') && !src.startsWith('about:')) {
                    pdfUrl = src;
                    break;
                  }
                }
              }
            }

            console.log('正在解析PDF:', pdfUrl);

            // 验证PDF URL是否有效
            if (!pdfUrl || pdfUrl === 'about:blank' || pdfUrl.startsWith('about:') || (pdfUrl === window.location.href && !pdfUrl.includes('.pdf'))) {
              console.warn('无法获取有效的PDF URL:', pdfUrl);
              resolve({
                title: document.title || 'PDF文档',
                page_url: window.location.href,
                page_content: '当前页面无法解析为PDF文件，可能是页面尚未加载完成或不包含PDF内容。建议稍后重试或检查页面是否正确显示PDF。',
                error: false,
                content_type: 'pdf'
              });
              return;
            }

            // 加载PDF文档
            const loadingTask = (window as any).pdfjsLib!.getDocument({
              url: pdfUrl,
              cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
              cMapPacked: true
            });

            const pdf = await loadingTask.promise;
            console.log('PDF文档加载成功, 总页数:', pdf.numPages);

            let fullText = '';
            const numPages = pdf.numPages;
            // TODO 后续进行页面提取分割
            const maxPages = numPages;

            // 提取所有页面文本
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
              try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                  .filter((item: any) => item.str && item.str.trim())
                  .map((item: any) => item.str)
                  .join(' ');

                if (pageText.trim()) {
                  fullText += `\n--- 第${pageNum}页 ---\n${pageText.trim()}\n`;
                }

                console.log(`第${pageNum}页文本提取完成`);
              } catch (pageError: any) {
                console.error(`第${pageNum}页提取失败:`, pageError);
                fullText += `\n--- 第${pageNum}页 ---\n[页面内容提取失败: ${pageError.message}]\n`;
              }
            }

            const result = {
              title: document.title || 'PDF文档',
              page_url: pdfUrl,
              page_content: fullText.trim() || '未能提取到PDF文本内容',
              total_pages: numPages,
              extracted_pages: maxPages,
              content_type: 'pdf'
            };

            console.log('PDF内容提取完成:', {
              totalPages: numPages,
              extractedPages: maxPages,
              contentLength: fullText.length
            });

            resolve(result);

          } catch (error: any) {
            console.error('PDF处理过程中发生错误:', error);
            resolve({
              title: document.title || 'PDF文档',
              page_url: window.location.href,
              page_content: `PDF内容提取失败: ${error.message}`,
              error: true,
              content_type: 'pdf'
            });
          }
        });
      }, []);
    } catch (error: any) {
      console.error('PDF内容提取失败:', error);
      return {
        title: this.detailView.webContents.getTitle() || 'PDF文档',
        page_url: this.detailView.webContents.getURL(),
        page_content: `PDF内容提取失败: ${error.message}`,
        error: true,
        content_type: 'pdf'
      };
    }
  }
}

export { BrowserAgent };