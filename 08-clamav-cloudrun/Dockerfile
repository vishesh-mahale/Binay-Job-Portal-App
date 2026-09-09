FROM clamav/clamav:stable-debian13-slim

RUN apt-get update && \
    apt-get install -y python3 python3-pip netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip3 install --break-system-packages -r /app/requirements.txt

COPY app.py /app/app.py
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3310
EXPOSE 8080

CMD ["/app/start.sh"]
