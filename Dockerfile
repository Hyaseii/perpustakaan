FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=7860
ENV APP_HOST=0.0.0.0
ENV APP_ENV=production

EXPOSE 7860

CMD ["python", "Backend/app.py"]