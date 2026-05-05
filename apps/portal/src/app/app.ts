import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChatBotComponent } from './features/chat-bot/chat-bot.component';

@Component({
  imports: [ChatBotComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected title = 'Nx portal Demo';
}
