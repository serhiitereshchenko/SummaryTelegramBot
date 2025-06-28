const OpenAI = require('openai');
const logger = require('./logger');
const moment = require('moment-timezone');
const fs = require('fs').promises;
const path = require('path');

class SummaryService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.MAX_MESSAGES_PER_CHUNK = 100; // Maximum messages per chunk
    this.MAX_TOKENS_PER_REQUEST = 3000; // Conservative token limit
  }

  async generateSummary(messages, options = {}) {
    if (!messages || messages.length === 0) {
      // This will be handled by the calling code with proper translations
      return null;
    }

    try {
      const { maxLength = parseInt(process.env.DEFAULT_SUMMARY_LENGTH) || 1500, language = 'en', timezone = 'UTC' } = options;
      
      logger.info(`Generating summary for ${messages.length} messages with language: ${language}, maxLength: ${maxLength}, timezone: ${timezone}`);
      
      // Check if we need to handle large message volumes
      if (messages.length > this.MAX_MESSAGES_PER_CHUNK) {
        logger.info(`Large message volume detected (${messages.length} messages). Using chunked summarization.`);
        return await this.generateChunkedSummary(messages, options);
      }
      
      // Regular summary generation for smaller conversations
      const formattedMessages = this.formatMessagesForAI(messages, timezone);
      
      // Check if formatted messages are too long
      const estimatedTokens = this.estimateTokenCount(formattedMessages);
      if (estimatedTokens > this.MAX_TOKENS_PER_REQUEST) {
        logger.info(`Message content too large (estimated ${estimatedTokens} tokens). Using chunked summarization.`);
        return await this.generateChunkedSummary(messages, options);
      }
      
      const prompt = this.buildPrompt(formattedMessages, maxLength, language);
      const systemPrompt = this.buildSystemPrompt(language);
      
      logger.debug(`System prompt: ${systemPrompt}`);
      logger.debug(`User prompt: ${prompt.substring(0, 200)}...`);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: Math.min(maxLength * 1.5, 3000),
        temperature: 0.3
      });

      const summary = response.choices[0].message.content.trim();
      logger.info(`Generated summary length: ${summary.length} characters`);
      
      return summary;
    } catch (error) {
      logger.error('Error generating summary:', error);
      
      // If OpenAI fails, try to provide a text file export as fallback
      if (error.message.includes('rate limit') || error.message.includes('quota') || error.message.includes('timeout')) {
        logger.info('OpenAI service unavailable. Providing text file export as fallback.');
        return await this.generateTextFileFallback(messages, options);
      }
      
      throw new Error('Failed to generate summary. Please try again later.');
    }
  }

  async generateChunkedSummary(messages, options = {}) {
    const { maxLength = 1500, language = 'en', timezone = 'UTC' } = options;
    
    try {
      // Split messages into chunks
      const chunks = this.chunkMessages(messages, this.MAX_MESSAGES_PER_CHUNK);
      logger.info(`Split ${messages.length} messages into ${chunks.length} chunks`);
      
      // Generate summaries for each chunk
      const chunkSummaries = [];
      for (let i = 0; i < chunks.length; i++) {
        logger.info(`Processing chunk ${i + 1}/${chunks.length}`);
        const chunkSummary = await this.generateSummaryForChunk(chunks[i], {
          ...options,
          chunkIndex: i + 1,
          totalChunks: chunks.length
        });
        chunkSummaries.push(chunkSummary);
      }
      
      // If we have multiple chunks, create a final summary
      if (chunkSummaries.length > 1) {
        logger.info('Generating final summary from chunk summaries');
        return await this.generateFinalSummary(chunkSummaries, options);
      } else {
        return chunkSummaries[0];
      }
    } catch (error) {
      logger.error('Error in chunked summarization:', error);
      return await this.generateTextFileFallback(messages, options);
    }
  }

  async generateSummaryForChunk(messages, options = {}) {
    const { language = 'en', timezone = 'UTC', chunkIndex, totalChunks } = options;
    
    const formattedMessages = this.formatMessagesForAI(messages, timezone);
    const systemPrompt = this.buildSystemPrompt(language);
    
    const chunkPrompt = `This is chunk ${chunkIndex} of ${totalChunks} from a large conversation. 
Create a detailed summary of this portion of the conversation. Focus on the key points, topics discussed, and important information shared in this segment.

Chat conversation segment:
${formattedMessages}

Summary:`;
    
    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: chunkPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    return response.choices[0].message.content.trim();
  }

  async generateFinalSummary(chunkSummaries, options = {}) {
    const { language = 'en', maxLength = 1500 } = options;
    
    const combinedSummaries = chunkSummaries.join('\n\n---\n\n');
    const systemPrompt = this.buildSystemPrompt(language);
    
    const finalPrompt = `Create a comprehensive final summary of the entire conversation based on these chunk summaries. 
Combine and synthesize the information into a coherent, detailed summary that captures the full scope of the conversation.

Chunk summaries:
${combinedSummaries}

Create a comprehensive ${maxLength}-character summary that ties everything together:`;
    
    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalPrompt }
      ],
      max_tokens: Math.min(maxLength * 1.5, 3000),
      temperature: 0.3
    });

    return response.choices[0].message.content.trim();
  }

  async generateTextFileFallback(messages, options = {}) {
    const { language = 'en', timezone = 'UTC' } = options;
    
    try {
      // Create a formatted text file
      const formattedContent = this.formatMessagesForTextFile(messages, timezone);
      
      // Create logs directory if it doesn't exist
      const logsDir = path.join(process.cwd(), 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      
      // Generate filename with timestamp
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const filename = `chat_export_${timestamp}.txt`;
      const filepath = path.join(logsDir, filename);
      
      // Write the file
      await fs.writeFile(filepath, formattedContent, 'utf8');
      
      logger.info(`Created text file fallback: ${filepath}`);
      
      // Return a message explaining the fallback
      const fallbackMessages = {
        'en': `📄 *Large Chat Export*\n\nDue to the large volume of messages (${messages.length}), I've created a text file with the complete conversation.\n\n📁 File: \`${filename}\`\n📊 Messages: ${messages.length}\n⏰ Time range: ${this.getTimeRange(messages, timezone)}\n\nYou can download this file to review the full conversation.`,
        'es': `📄 *Exportación de Chat Grande*\n\nDebido al gran volumen de mensajes (${messages.length}), he creado un archivo de texto con la conversación completa.\n\n📁 Archivo: \`${filename}\`\n📊 Mensajes: ${messages.length}\n⏰ Rango de tiempo: ${this.getTimeRange(messages, timezone)}\n\nPuedes descargar este archivo para revisar la conversación completa.`,
        'fr': `📄 *Export de Chat Volumineux*\n\nEn raison du grand volume de messages (${messages.length}), j'ai créé un fichier texte avec la conversation complète.\n\n📁 Fichier: \`${filename}\`\n📊 Messages: ${messages.length}\n⏰ Plage horaire: ${this.getTimeRange(messages, timezone)}\n\nVous pouvez télécharger ce fichier pour examiner la conversation complète.`,
        'de': `📄 *Großer Chat-Export*\n\nAufgrund der großen Anzahl von Nachrichten (${messages.length}) habe ich eine Textdatei mit der vollständigen Konversation erstellt.\n\n📁 Datei: \`${filename}\`\n📊 Nachrichten: ${messages.length}\n⏰ Zeitbereich: ${this.getTimeRange(messages, timezone)}\n\nSie können diese Datei herunterladen, um die vollständige Konversation zu überprüfen.`,
        'ru': `📄 *Экспорт Большого Чата*\n\nИз-за большого объема сообщений (${messages.length}) я создал текстовый файл с полной беседой.\n\n📁 Файл: \`${filename}\`\n📊 Сообщений: ${messages.length}\n⏰ Временной диапазон: ${this.getTimeRange(messages, timezone)}\n\nВы можете скачать этот файл для просмотра полной беседы.`,
        'uk': `📄 *Експорт Великого Чату*\n\nЧерез великий обсяг повідомлень (${messages.length}) я створив текстовий файл з повною розмовою.\n\n📁 Файл: \`${filename}\`\n📊 Повідомлень: ${messages.length}\n⏰ Часовий діапазон: ${this.getTimeRange(messages, timezone)}\n\nВи можете завантажити цей файл для перегляду повної розмови.`
      };
      
      return fallbackMessages[language] || fallbackMessages['en'];
    } catch (error) {
      logger.error('Error creating text file fallback:', error);
      throw new Error('Failed to generate summary or create fallback. Please try again later.');
    }
  }

  formatMessagesForTextFile(messages, timezone = 'UTC') {
    const header = `=== CHAT EXPORT ===
Generated: ${moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss')}
Timezone: ${timezone}
Total Messages: ${messages.length}
Time Range: ${this.getTimeRange(messages, timezone)}

=== MESSAGES ===

`;
    
    const formattedMessages = messages
      .filter(msg => msg.text && msg.text.trim().length > 0)
      .map(msg => {
        const username = msg.username || msg.first_name || 'Unknown';
        const timestamp = moment.unix(msg.timestamp).tz(timezone);
        const timeString = timestamp.format('YYYY-MM-DD HH:mm:ss');
        
        return `[${timeString}] ${username}: ${msg.text}`;
      })
      .join('\n\n');
    
    return header + formattedMessages;
  }

  getTimeRange(messages, timezone = 'UTC') {
    if (messages.length === 0) return 'No messages';
    
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];
    
    const firstTime = moment.unix(firstMsg.timestamp).tz(timezone).format('YYYY-MM-DD HH:mm');
    const lastTime = moment.unix(lastMsg.timestamp).tz(timezone).format('YYYY-MM-DD HH:mm');
    
    return `${firstTime} to ${lastTime}`;
  }

  chunkMessages(messages, chunkSize) {
    const chunks = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
  }

  estimateTokenCount(text) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  formatMessagesForAI(messages, timezone = 'UTC') {
    return messages
      .filter(msg => msg.text && msg.text.trim().length > 0)
      .filter(msg => !msg.text.includes('#ChatSummary')) // Exclude messages with #ChatSummary hashtag
      .map(msg => {
        // Add @ prefix to usernames to make them clickable in Telegram
        let username = msg.username || msg.first_name || 'Unknown';
        if (msg.username) {
          username = `@${username}`;
        } else if (msg.first_name) {
          // For users without username, use first name with @ prefix
          username = `@${msg.first_name}`;
        }
        
        // Use moment-timezone to format time in the user's timezone
        const timestamp = moment.unix(msg.timestamp).tz(timezone);
        const timeString = timestamp.format('HH:mm'); // 24-hour format
        
        return `[${timeString}] ${username}: ${msg.text}`;
      })
      .join('\n');
  }

  buildSystemPrompt(language) {
    const systemPrompts = {
      'en': 'You are a friendly, casual assistant who creates comprehensive and detailed summaries of chat conversations in English. Your summaries should be thorough and capture the essence of the entire conversation. Use a conversational tone and emojis to make summaries more readable. IMPORTANT: Include specific timecodes (in 24-hour format like "18:48") and mention people by name when they speak or are mentioned. Make the summary feel personal and chronological. Always respond in English only.',
      'es': 'Eres un asistente amigable y casual que crea resúmenes completos y detallados de conversaciones de chat en español. Tus resúmenes deben ser exhaustivos y capturar la esencia de toda la conversación. Usa un tono conversacional y emojis para hacer los resúmenes más legibles. IMPORTANTE: Incluye códigos de tiempo específicos (en formato 24 horas como "18:48") y menciona a las personas por nombre cuando hablan o son mencionadas. Haz que el resumen se sienta personal y cronológico. Siempre responde únicamente en español.',
      'fr': 'Vous êtes un assistant amical et décontracté qui crée des résumés complets et détaillés des conversations de chat en français. Vos résumés doivent être approfondis et capturer l\'essence de toute la conversation. Utilisez un ton conversationnel et des emojis pour rendre les résumés plus lisibles. IMPORTANT: Incluez des codes temporels spécifiques (au format 24 heures comme "18:48") et mentionnez les personnes par leur nom quand elles parlent ou sont mentionnées. Rendez le résumé personnel et chronologique. Répondez toujours uniquement en français.',
      'de': 'Sie sind ein freundlicher, lockerer Assistent, der umfassende und detaillierte Zusammenfassungen von Chat-Unterhaltungen auf Deutsch erstellt. Ihre Zusammenfassungen sollten gründlich sein und die Essenz des gesamten Gesprächs erfassen. Verwenden Sie einen gesprächigen Ton und Emojis, um die Zusammenfassungen lesbarer zu machen. WICHTIG: Fügen Sie spezifische Zeitcodes hinzu (im 24-Stunden-Format wie "18:48") und erwähnen Sie Personen beim Namen, wenn sie sprechen oder erwähnt werden. Machen Sie die Zusammenfassung persönlich und chronologisch. Antworten Sie immer nur auf Deutsch.',
      'it': 'Sei un assistente amichevole e casual che crea riassunti completi e dettagliati di conversazioni chat in italiano. I tuoi riassunti dovrebbero essere approfonditi e catturare l\'essenza dell\'intera conversazione. Usa un tono colloquiale ed emoji per rendere i riassunti più leggibili. IMPORTANTE: Includi codici temporali specifici (in formato 24 ore come "18:48") e menziona le persone per nome quando parlano o sono menzionate. Rendi il riassunto personale e cronologico. Rispondi sempre solo in italiano.',
      'pt': 'Você é um assistente amigável e casual que cria resumos completos e detalhados de conversas de chat em português. Seus resumos devem ser abrangentes e capturar a essência de toda a conversa. Use um tom conversacional e emojis para tornar os resumos mais legíveis. IMPORTANTE: Inclua códigos de tempo específicos (no formato 24 horas como "18:48") e mencione pessoas pelo nome quando elas falam ou são mencionadas. Torne o resumo pessoal e cronológico. Sempre responda apenas em português.',
      'ru': 'Вы дружелюбный, непринужденный помощник, который создает всесторонние и подробные резюме чат-разговоров на русском языке. Ваши резюме должны быть основательными и захватывать суть всего разговора. Используйте разговорный тон и эмодзи, чтобы сделать резюме более читабельными. ВАЖНО: Включайте конкретные временные коды (в 24-часовом формате как "18:48") и упоминайте людей по имени, когда они говорят или упоминаются. Сделайте резюме личным и хронологическим. Всегда отвечайте только на русском языке.',
      'ja': 'あなたは日本語でチャット会話の包括的で詳細な要約を作成する、フレンドリーでカジュアルなアシスタントです。要約は徹底的で、会話全体の本質を捉える必要があります。要約を読みやすくするために会話的なトーンと絵文字を使用します。重要：特定の時間コード（24時間形式で「18:48」など）を含め、人々が話すか言及されたときに名前で言及してください。要約を個人的で時系列的に感じさせてください。常に日本語のみで回答してください。',
      'ko': '당신은 한국어로 채팅 대화의 포괄적이고 상세한 요약을 만드는 친근하고 캐주얼한 어시스턴트입니다. 요약은 철저하고 전체 대화의 본질을 포착해야 합니다. 요약을 더 읽기 쉽게 만들기 위해 대화적인 톤과 이모지를 사용하세요. 중요: 특정 시간 코드(24시간 형식으로 "18:48" 등)를 포함하고 사람들이 말하거나 언급될 때 이름으로 언급하세요. 요약을 개인적이고 시간순으로 느끼게 만드세요. 항상 한국어로만 답변하세요.',
      'zh': '您是一个友好、随意的助手，用中文创建聊天对话的全面详细摘要。您的摘要应该是透彻的，并捕捉整个对话的精髓。使用对话式语调和表情符号使摘要更易读。重要：包含特定的时间代码（24小时格式如"18:48"）并在人们说话或被提及时按姓名提及他们。让摘要感觉个人化和按时间顺序排列。请始终只用中文回答。',
      'ar': 'أنت مساعد ودود وعادي ينشئ ملخصات شاملة ومفصلة لمحادثات الدردشة باللغة العربية. يجب أن تكون ملخصاتك شاملة وتلتقط جوهر المحادثة بأكملها. استخدم نبرة محادثة ورموز تعبيرية لجعل الملخصات أكثر قابلية للقراءة. مهم: قم بتضمين رموز زمنية محددة (بتنسيق 24 ساعة مثل "18:48") واذكر الأشخاص بالاسم عندما يتحدثون أو يتم ذكرهم. اجعل الملخص شخصيًا وترتيبًا زمنيًا. أجب دائماً باللغة العربية فقط.',
      'hi': 'आप एक मित्रवत, आकस्मिक सहायक हैं जो हिंदी में चैट वार्तालापों के व्यापक और विस्तृत सारांश बनाते हैं। आपके सारांश संपूर्ण होने चाहिए और पूरी बातचीत के सार को पकड़ना चाहिए। सारांश को अधिक पढ़ने योग्य बनाने के लिए बातचीत के लहजे और इमोजी का उपयोग करें। महत्वपूर्ण: विशिष्ट समय कोड (24 घंटे के प्रारूप में "18:48" की तरह) शामिल करें और जब लोग बोलते हैं या उनका उल्लेख किया जाता है तो उन्हें नाम से उल्लेख करें। सारांश को व्यक्तिगत और कालानुक्रमिक बनाएं। हमेशा केवल हिंदी में उत्तर दें।',
      'uk': 'Ви дружелюбний, невимушений помічник, який створює всебічні та детальні резюме чат-розмов українською мовою. Ваші резюме повинні бути ретельними та відображати суть всієї розмови. Використовуйте розмовний тон та емодзі, щоб зробити резюме більш читабельними. ВАЖЛИВО: Включайте конкретні часові коди (у 24-годинному форматі як "18:48") та згадуйте людей за іменами, коли вони говорять або згадуються. Зробіть резюме особистим та хронологічним. Завжди відповідайте лише українською мовою.',
      'pl': 'Jesteś przyjaznym, swobodnym asystentem, który tworzy kompleksowe i szczegółowe podsumowania rozmów czatowych w języku polskim. Twoje podsumowania powinny być dokładne i oddawać istotę całej rozmowy. Używaj konwersacyjnego tonu i emoji, aby podsumowania były bardziej czytelne. WAŻNE: Uwzględnij konkretne kody czasowe (w formacie 24-godzinnym jak "18:48") i wymień osoby po imieniu, gdy mówią lub są wymienione. Spraw, aby podsumowanie było osobiste i chronologiczne. Zawsze odpowiadaj tylko po polsku.',
      'nl': 'Je bent een vriendelijke, casual assistent die uitgebreide en gedetailleerde samenvattingen van chatgesprekken in het Nederlands maakt. Je samenvattingen moeten grondig zijn en de essentie van het hele gesprek vastleggen. Gebruik een conversationele toon en emoji\'s om samenvattingen leesbaarder te maken. BELANGRIJK: Neem specifieke tijdscodes op (in 24-uurs formaat zoals "18:48") en noem mensen bij naam wanneer ze spreken of worden genoemd. Maak de samenvatting persoonlijk en chronologisch. Antwoord altijd alleen in het Nederlands.',
      'tr': 'Türkçe olarak sohbet konuşmalarının kapsamlı ve ayrıntılı özetlerini oluşturan dostane, rahat bir asistansınız. Özetleriniz kapsamlı olmalı ve tüm konuşmanın özünü yakalamalıdır. Özetleri daha okunabilir hale getirmek için konuşma tonu ve emoji kullanın. ÖNEMLİ: Belirli zaman kodlarını dahil edin (24 saat formatında "18:48" gibi) ve insanlar konuştuğunda veya bahsedildiğinde onları isimle belirtin. Özeti kişisel ve kronolojik hale getirin. Her zaman sadece Türkçe yanıt verin.'
    };

    return systemPrompts[language] || systemPrompts['en'];
  }

  buildPrompt(formattedMessages, maxLength, language) {
    const languageNames = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'uk': 'Ukrainian',
      'pl': 'Polish',
      'nl': 'Dutch',
      'tr': 'Turkish'
    };

    const languageName = languageNames[language] || 'English';

    return `CRITICAL: You MUST respond in ${languageName} language only. Do not use any other language.

Create a comprehensive ${maxLength}-character summary of the following chat conversation in ${languageName}. 

This should be a DETAILED summary that captures the full scope of the conversation. Don't be brief - provide a thorough overview that someone who missed the conversation can understand completely.

Style guidelines:
- Use friendly, conversational language 🗣️
- Add appropriate emojis to make it more engaging 😊
- Keep it factual but readable and detailed
- Don't add personal opinions, thoughts, or advice
- Focus on what actually happened in the conversation
- Include specific details, names, and context
- Break down different conversation threads or topics clearly
- IMPORTANT: Include timecodes (like "at 2:30 PM") and mention people by name when they speak
- Make it feel like a personal, chronological story of the conversation

Focus on:
- All main topics discussed (with details and context)
- Important decisions or conclusions reached
- Key information shared (be specific)
- Notable events, announcements, or revelations
- Action items, plans, or commitments made
- Timeline of how the conversation evolved (with timecodes)
- Who said what and when (mention names and times)
- Any debates, agreements, or disagreements
- Links, resources, or references mentioned
- The flow and progression of the conversation over time

Chat conversation:
${formattedMessages}

End your summary with the hashtag: #ChatSummary

Remember: Your entire response must be in ${languageName} language. Make it comprehensive, detailed, and personal with timecodes and names!

Summary:`;
  }

  postProcessSummary(summary, messages, chatId, timezone = 'UTC') {
    if (!messages || messages.length === 0) {
      return summary;
    }

    try {
      // Create a map of time strings to message IDs for quick lookup
      const timeToMessageMap = new Map();
      
      messages.forEach(msg => {
        const timestamp = moment.unix(msg.timestamp).tz(timezone);
        const timeString = timestamp.format('HH:mm'); // 24-hour format
        
        // Store the message ID for this time
        if (!timeToMessageMap.has(timeString)) {
          timeToMessageMap.set(timeString, msg.message_id);
        }
      });

      // Replace time patterns with clickable links
      // Match patterns like "at 18:48", "18:48", etc. (24-hour format)
      const timePatterns = [
        /at\s+(\d{1,2}:\d{2})/gi,
        /(\d{1,2}:\d{2})/g
      ];

      let processedSummary = summary;

      timePatterns.forEach(pattern => {
        processedSummary = processedSummary.replace(pattern, (match, timeStr) => {
          // Normalize time format for lookup
          const normalizedTime = timeStr.replace(/^(\d{1,2}):(\d{2})$/, (_, hour, minute) => {
            const h = parseInt(hour);
            const m = parseInt(minute);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          });

          const messageId = timeToMessageMap.get(normalizedTime);
          
          if (messageId) {
            // Create Telegram deep link to the specific message
            const link = `https://t.me/c/${chatId.toString().replace('-100', '')}/${messageId}`;
            return `[${match}](${link})`;
          }
          
          return match;
        });
      });

      return processedSummary;
    } catch (error) {
      logger.error('Error post-processing summary:', error);
      return summary; // Return original summary if processing fails
    }
  }
}

module.exports = SummaryService;
