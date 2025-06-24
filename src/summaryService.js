const OpenAI = require('openai');
const logger = require('./logger');

class SummaryService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateSummary(messages, options = {}) {
    if (!messages || messages.length === 0) {
      return "No messages found for the specified time period.";
    }

    try {
      const { maxLength = parseInt(process.env.DEFAULT_SUMMARY_LENGTH) || 1500, language = 'en' } = options;
      
      logger.info(`Generating summary with language: ${language}, maxLength: ${maxLength}`);
      
      // Format messages for AI processing
      const formattedMessages = this.formatMessagesForAI(messages);
      
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
      throw new Error('Failed to generate summary. Please try again later.');
    }
  }

  formatMessagesForAI(messages) {
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
        
        const timestamp = new Date(msg.timestamp * 1000);
        const timeString = timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
        const dateString = timestamp.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
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

  postProcessSummary(summary, messages, chatId) {
    if (!messages || messages.length === 0) {
      return summary;
    }

    try {
      // Create a map of time strings to message IDs for quick lookup
      const timeToMessageMap = new Map();
      
      messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp * 1000);
        const timeString = timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
        
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
