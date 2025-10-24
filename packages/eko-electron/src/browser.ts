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
  //     // Get video URL from Electron store
  //     const videoUrlMap = store.get('videoUrlMap', {});
  //     const videoInfo = videoUrlMap[xiaohongshuUrl];

  //     if (videoInfo && videoInfo.platform === 'xiaohongshu' && videoInfo.videoUrl) {
  //       console.log('Retrieved Xiaohongshu video URL from store:', videoInfo.videoUrl);
  //       return videoInfo.videoUrl;
  //     } else {
  //       throw new Error('Video URL not found for this Xiaohongshu page, please open the page in detailView first');
  //     }
  //   } catch (error) {
  //     console.error('Failed to get Xiaohongshu video URL:', error);
  //     throw new Error(`Failed to get video URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  // Override extract_page_content method to support PDF
  protected async extract_page_content(agentContext: AgentContext): Promise<any> {
    const currentUrl = this.detailView.webContents.getURL();

    // Detect if this is a PDF page
    if (this.isPdfUrl(currentUrl) || await this.isPdfPage(agentContext)) {
      return await this.extractPdfContent(agentContext);
    }

    // Call parent class HTML content extraction
    return await super.extract_page_content(agentContext);
  }

  // Detect if URL is a PDF
  private isPdfUrl(url: string): boolean {
    return url.toLowerCase().includes('.pdf') ||
           url.includes('application/pdf') ||
           url.includes('viewer.html') || // Chrome PDF viewer
           url.includes('#page='); // PDF page anchor
  }

  // Detect if current page is a PDF
  private async isPdfPage(agentContext: AgentContext): Promise<boolean> {
    try {
      return await this.execute_script(agentContext, () => {
        // Detect PDF viewer characteristics
        return document.querySelector('embed[type="application/pdf"]') !== null ||
               document.querySelector('iframe[src*=".pdf"]') !== null ||
               document.querySelector('#viewer') !== null || // Chrome PDF viewer
               document.querySelector('.pdfViewer') !== null || // Firefox PDF viewer
               document.contentType === 'application/pdf' ||
               window.location.href.includes('viewer.html');
      }, []);
    } catch (error) {
      console.warn('PDF detection failed:', error);
      return false;
    }
  }

  // Extract PDF content
  private async extractPdfContent(agentContext: AgentContext): Promise<any> {
    try {
      return await this.execute_script(agentContext, () => {
        return new Promise(async (resolve) => {
          try {
            // Dynamically load PDF.js
            if (!(window as any).pdfjsLib) {
              console.log('Starting to load PDF.js library...');

              // Load PDF.js main file
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
              script.crossOrigin = 'anonymous';

              await new Promise((scriptResolve, scriptReject) => {
                script.onload = () => {
                  console.log('PDF.js main file loaded successfully');
                  scriptResolve(true);
                };
                script.onerror = () => {
                  console.error('Failed to load PDF.js main file');
                  scriptReject(new Error('Failed to load PDF.js'));
                };
                document.head.appendChild(script);
              });

              // Configure worker
              (window as any).pdfjsLib!.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

              console.log('PDF.js configuration completed');
            }

            // Get PDF URL
            let pdfUrl = window.location.href;

            // Try to get actual PDF URL from various PDF containers
            const embedEl = document.querySelector('embed[type="application/pdf"]') as HTMLEmbedElement;
            const iframeEl = document.querySelector('iframe[src*=".pdf"]') as HTMLIFrameElement;

            if (embedEl && embedEl.src && embedEl.src !== 'about:blank' && !embedEl.src.startsWith('about:')) {
              pdfUrl = embedEl.src;
            } else if (iframeEl && iframeEl.src && iframeEl.src !== 'about:blank' && !iframeEl.src.startsWith('about:')) {
              pdfUrl = iframeEl.src;
            } else if (window.location.href.includes('viewer.html')) {
              // Chrome PDF viewer format: chrome://pdf-viewer/index.html?src=URL
              const urlParams = new URLSearchParams(window.location.search);
              const srcParam = urlParams.get('src') || urlParams.get('file');
              if (srcParam) {
                pdfUrl = decodeURIComponent(srcParam);
              }
            } else if (pdfUrl === window.location.href && (pdfUrl === 'about:blank' || pdfUrl.startsWith('about:'))) {
              // If current URL is also about:blank, try other methods to get real PDF URL
              // Check if page has other clues containing PDF URL
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

            console.log('Parsing PDF:', pdfUrl);

            // Validate if PDF URL is valid
            if (!pdfUrl || pdfUrl === 'about:blank' || pdfUrl.startsWith('about:') || (pdfUrl === window.location.href && !pdfUrl.includes('.pdf'))) {
              console.warn('Unable to get valid PDF URL:', pdfUrl);
              resolve({
                title: document.title || 'PDF Document',
                page_url: window.location.href,
                page_content: 'Current page cannot be parsed as a PDF file. The page may not be fully loaded or does not contain PDF content. Please try again later or check if the page displays the PDF correctly.',
                error: false,
                content_type: 'pdf'
              });
              return;
            }

            // Load PDF document
            const loadingTask = (window as any).pdfjsLib!.getDocument({
              url: pdfUrl,
              cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
              cMapPacked: true
            });

            const pdf = await loadingTask.promise;
            console.log('PDF document loaded successfully, total pages:', pdf.numPages);

            let fullText = '';
            const numPages = pdf.numPages;
            // TODO: Implement page extraction splitting in the future
            const maxPages = numPages;

            // Extract text from all pages
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
              try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                  .filter((item: any) => item.str && item.str.trim())
                  .map((item: any) => item.str)
                  .join(' ');

                if (pageText.trim()) {
                  fullText += `\n--- Page ${pageNum} ---\n${pageText.trim()}\n`;
                }

                console.log(`Page ${pageNum} text extraction completed`);
              } catch (pageError: any) {
                console.error(`Page ${pageNum} extraction failed:`, pageError);
                fullText += `\n--- Page ${pageNum} ---\n[Page content extraction failed: ${pageError.message}]\n`;
              }
            }

            const result = {
              title: document.title || 'PDF Document',
              page_url: pdfUrl,
              page_content: fullText.trim() || 'Failed to extract PDF text content',
              total_pages: numPages,
              extracted_pages: maxPages,
              content_type: 'pdf'
            };

            console.log('PDF content extraction completed:', {
              totalPages: numPages,
              extractedPages: maxPages,
              contentLength: fullText.length
            });

            resolve(result);

          } catch (error: any) {
            console.error('Error occurred during PDF processing:', error);
            resolve({
              title: document.title || 'PDF Document',
              page_url: window.location.href,
              page_content: `PDF content extraction failed: ${error.message}`,
              error: true,
              content_type: 'pdf'
            });
          }
        });
      }, []);
    } catch (error: any) {
      console.error('PDF content extraction failed:', error);
      return {
        title: this.detailView.webContents.getTitle() || 'PDF Document',
        page_url: this.detailView.webContents.getURL(),
        page_content: `PDF content extraction failed: ${error.message}`,
        error: true,
        content_type: 'pdf'
      };
    }
  }
}

export { BrowserAgent };