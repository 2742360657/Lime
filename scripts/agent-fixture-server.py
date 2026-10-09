#!/usr/bin/env python3
"""Development-only synthetic DeepSeek SSE; not a product/backend service.

Bind loopback, no keys/accounts or ordinary data. Only run with the isolated
debug probe and adb reverse tcp:8092 tcp:8092; remove reverse after verification.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import time
import uuid


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        if not 0 < length < 128 * 1024:
            self.send_error(400)
            return
        payload = json.loads(self.rfile.read(length))
        messages = payload['messages']
        last = messages[-1]
        if last['role'] == 'tool':
            tool_name = next(m['tool_calls'][0]['function']['name'] for m in reversed(messages) if m['role'] == 'assistant' and m.get('tool_calls'))
            if tool_name == 'query_records':
                activity = json.loads(last['content'])[0]
                command = {'type': 'activity.complete', 'id': activity['id'], 'expectedRevision': activity['revision'] - 1, 'note': '合成完成感受'}
                delta = {'tool_calls': [{'index': 0, 'id': str(uuid.uuid4()), 'type': 'function', 'function': {'name': 'change_record', 'arguments': json.dumps(command)}}]}
                reason = 'tool_calls'
            else:
                delta, reason = {'content': '合成回答：请查看操作结果。'}, 'stop'
        else:
            text = next(m['content'] for m in reversed(messages) if m['role'] == 'user')
            if '新建待办' in text:
                command = {'type': 'task.create', 'title': '合成待办'}
            elif '今天练什么' in text:
                command = {'type': 'activity.start', 'kind': 'training', 'title': '合成训练计划', 'habitId': 'synthetic-habit'}
            elif '练完了' in text:
                # The replay test uses the durable original grant target after completion.
                context = next(m['content'] for m in messages if m['role'] == 'user' and m['content'].startswith('当前本机上下文'))
                data = json.loads(context.split('\n', 1)[1])
                if data['activities']:
                    activity = data['activities'][0]
                else:
                    command = {'kind': 'activities', 'status': 'completed'}
                    activity = None
                if activity:
                    command = {'type': 'activity.complete', 'id': activity['id'], 'expectedRevision': activity['revision'], 'note': '合成完成感受'}
            else:
                self.send_error(400)
                return
            tool_name = 'query_records' if command.get('kind') == 'activities' else 'change_record'
            delta = {'tool_calls': [{'index': 0, 'id': str(uuid.uuid4()), 'type': 'function', 'function': {'name': tool_name, 'arguments': json.dumps(command, ensure_ascii=False)}}]}
            reason = 'tool_calls'
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for delta_value, finish_reason in ((delta, None), ({}, reason)):
            chunk = {'id': 'synthetic', 'object': 'chat.completion.chunk', 'created': 0, 'model': 'deepseek-flash', 'choices': [{'index': 0, 'delta': delta_value, 'finish_reason': finish_reason}]}
            self.wfile.write(('data: ' + json.dumps(chunk, ensure_ascii=False) + '\n\n').encode())
            self.wfile.flush()
            time.sleep(0.03)
        self.wfile.write(b'data: [DONE]\n\n')
        self.wfile.flush()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8092), Fixture).serve_forever()
