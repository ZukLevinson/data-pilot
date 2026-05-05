import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { ChatService } from './chat.service';
import { Response } from 'express';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly chatService: ChatService
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('config')
  getConfig() {
    return {
      modelName: this.chatService.modelName,
      embeddingModel: this.chatService.embeddingModel,
    };
  }

  @Post('chat')
  async handleChat(@Body() body: { userId: string; question: string }) {
    if (!body.userId || !body.question) {
      return { error: 'userId and question are required.' };
    }
    let fullReply = '';
    for await (const chunk of this.chatService.processChatStream(body.userId, body.question)) {
      fullReply += chunk.data;
    }
    return { reply: fullReply };
  }

  @Post('chat/stream')
  async streamChat(
    @Body() body: { userId: string; question: string },
    @Res() res: Response
  ) {
    if (!body.userId || !body.question) {
      res.status(400).send({ error: 'userId and question are required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      for await (const chunk of this.chatService.processChatStream(body.userId, body.question)) {
        res.write(`data: ${chunk.data}\n\n`);
      }
    } catch (error) {
      console.error('Streaming error:', error);
    } finally {
      res.end();
    }
  }
}
