import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChatInputComponent } from './chat-input';
import { ChatService } from '../../../../core/services/chat.service';
import { of } from 'rxjs';
import { signal } from '@angular/core';

describe('ChatInputComponent', () => {
  let component: ChatInputComponent;
  let fixture: ComponentFixture<ChatInputComponent>;
  let mockChatService: any;

  beforeEach(async () => {
    mockChatService = {
      isWaiting: signal(false),
      sendMessage: vi.fn().mockResolvedValue(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [ChatInputComponent, FormsModule, NoopAnimationsModule],
      providers: [
        { provide: ChatService, useValue: mockChatService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
